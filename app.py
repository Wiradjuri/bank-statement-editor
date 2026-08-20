import os
import json
import base64
from flask import Flask, request, render_template, send_file, jsonify
import pytesseract
from PIL import Image, ImageDraw, ImageFont
import cv2
import numpy as np
from pdf2image import convert_from_path
from openai import OpenAI
from dotenv import load_dotenv
from reportlab.lib.pagesizes import letter  # pyright: ignore[reportMissingModuleSource]
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

# --- Configuration ---
# Load environment variables from .env file
load_dotenv()

try:
    client = OpenAI(
        api_key=os.environ.get("VENICE_API_KEY"),
        base_url="https://api.venice.ai/api/v1"
    )
except Exception as e:
    print(f"Error initializing Venice API client: {e}")
    print("Please ensure you have set your VENICE_API_KEY in your .env file.")
    client = None

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['PROCESSED_FOLDER'] = 'processed'
app.config['OUTPUT_FOLDER'] = 'output'

# Create folders if they don't exist
for folder in [app.config['UPLOAD_FOLDER'], app.config['PROCESSED_FOLDER'], app.config['OUTPUT_FOLDER']]:
    os.makedirs(folder, exist_ok=True)

# --- Helper Functions ---

def preprocess_file(file_path, filename):
    """Creates a clean, high-resolution copy of the uploaded file."""
    if filename.lower().endswith('.pdf'):
        try:
            pages = convert_from_path(file_path, 300)
            if not pages: return None
            first_page = pages[0]
            processed_filename = os.path.splitext(filename)[0] + '.png'
            processed_path = os.path.join(app.config['PROCESSED_FOLDER'], processed_filename)
            first_page.save(processed_path, 'PNG')
            return processed_path
        except Exception as e:
            print(f"Error converting PDF: {e}")
            return None
    else:
        processed_path = os.path.join(app.config['PROCESSED_FOLDER'], filename)
        Image.open(file_path).save(processed_path)
        return processed_path

def encode_image(image_path):
    """Encodes an image file to a base64 string for the Venice API."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def identify_fields_with_ai(full_text):
    """Uses an LLM (via Venice) to identify key-value pairs from document text."""
    if not client:
        print("Venice client not initialized. Skipping AI field identification.")
        return {}
    prompt = f"""
    You are an expert document parser. Analyze the following text from a bank statement.
    Find the values for ONLY the following specific fields:
    - "Account Name"
    - "Requestor Name"
    - "Requestor Address"
    - "Branch Number (BSB)"
    - "Account Number"
    - "Balance as of 21 Jul 2026"
    Return your findings ONLY as a single JSON object. The keys must be exactly the field names listed above.
    If a value is missing or unclear, use an empty string for the value.
    Document Text:
    \"\"\"
    {full_text}
    \"\"\"
    """
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b",
            messages=[{"role": "user", "content": prompt}]
        )
        content = response.choices[0].message.content
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        return json.loads(content)
    except Exception as e:
        print(f"Error calling Venice API for field identification: {e}")
        return {}

def find_coordinates_with_ai(image_path, field_name):
    """Uses an LLM with vision (via Venice) to find the coordinates of a field's value."""
    if not client:
        print("Venice client not initialized. Skipping AI coordinate finding.")
        return None
    prompt = f"""
    Analyze the provided image. I need you to find the pixel coordinates of the VALUE for the field named "{field_name}".
    The field name is the label. The value is the data next to it.
    Please provide the coordinates of the bounding box around the VALUE ONLY. Return the result as a JSON object with keys: x, y, width, height.
    If you cannot find the field, return an empty JSON object {{}}.
    """
    try:
        response = client.chat.completions.create(
            model="gemini-3-6-flash",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encode_image(image_path)}"}},
                    ],
                }
            ],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Error calling Venice Vision API for coordinate finding: {e}")
        return None

def extract_transactions(full_text):
    """Extracts the list of transactions from the document text."""
    if not client:
        return []
    prompt = f"""
    You are a document data extraction expert. Analyze the text below and extract ALL transactions from the table.
    Return ONLY a valid JSON list of objects. Each object must have:
    - "date": (string, e.g., "20 JUL")
    - "details": (string, e.g., "VISA DEBIT PURCHASE CARD...")
    - "withdrawal": (float, or 0 if blank)
    - "deposit": (float, or 0 if blank)
    Document Text:
    \"\"\"
    {full_text}
    \"\"\"
    """
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b",
            messages=[{"role": "user", "content": prompt}]
        )
        content = response.choices[0].message.content
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        return json.loads(content)
    except Exception as e:
        print(f"Error extracting transactions: {e}")
        return []

def analyze_financial_health(full_text):
    """Analyzes transaction text to provide advice for rental/loan applications."""
    if not client:
        return {
            "total_deposits": 0, "total_withdrawals": 0, "net_cash_flow": 0,
            "concerns": ["AI client not initialized."], "verdict": "WEAK",
            "suggestions": ["Please check your API key and configuration."]
        }
    prompt = f"""
    You are a financial advisor AI. Analyze the following bank statement text and provide advice for a rental or loan application.
    Perform the following tasks and respond ONLY with a valid JSON object.
    The JSON object must have the following keys:
    "total_deposits": (float), "total_withdrawals": (float), "net_cash_flow": (float),
    "concerns": (array of strings), "verdict": (string, "STRONG", "MODERATE", or "WEAK"), "suggestions": (array of strings)
    Document Text:
    \"\"\"
    {full_text}
    \"\"\"
    """
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b",
            messages=[{"role": "user", "content": prompt}]
        )
        content = response.choices[0].message.content
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        analysis = json.loads(content)
        required_keys = ["total_deposits", "total_withdrawals", "net_cash_flow", "concerns", "verdict", "suggestions"]
        if not all(key in analysis for key in required_keys):
            raise ValueError("Parsed JSON is missing required keys.")
        return analysis
    except Exception as e:
        print(f"Error calling Venice API for financial analysis: {e}")
        return {
            "total_deposits": 0, "total_withdrawals": 0, "net_cash_flow": 0,
            "concerns": [f"Failed to analyze document: {e}"], "verdict": "WEAK",
            "suggestions": ["Please try re-uploading the document or check the console for errors."]
        }

# --- Flask Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/processed/<filename>')
def serve_processed_file(filename):
    return send_file(os.path.join(app.config['PROCESSED_FOLDER'], filename))

@app.route('/process', methods=['POST'])
def process_image():
    if 'file' not in request.files:
        return "No file part", 400
    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    if file:
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filepath)
        processed_image_path = preprocess_file(filepath, file.filename)
        if not processed_image_path:
            return "Could not process PDF file.", 500

        full_text = pytesseract.image_to_string(Image.open(processed_image_path))
        
        extracted_data = identify_fields_with_ai(full_text)
        transactions = extract_transactions(full_text)
        financial_analysis = analyze_financial_health(full_text)
        
        coords_cache = {}
        if extracted_data:
            for field_name in extracted_data.keys():
                coords = find_coordinates_with_ai(processed_image_path, field_name)
                if coords and 'x' in coords:
                    coords_cache[field_name] = coords

        return render_template('edit.html', 
                               data=extracted_data, 
                               transactions=transactions,
                               image_filename=os.path.basename(processed_image_path), 
                               coords=coords_cache,
                               analysis=financial_analysis)

@app.route('/analyze_changes', methods=['POST'])
def analyze_changes():
    try:
        transactions_json = request.json.get('transactions', [])
        transaction_text = "\n".join(
            [f"{t['date']} | {t['details']} | W:{t['withdrawal']} | D:{t['deposit']}" for t in transactions_json]
        )
        analysis = analyze_financial_health(transaction_text)
        return jsonify(analysis)
    except Exception as e:
        print(f"Error in real-time analysis: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/generate_final', methods=['POST'])
def generate_final():
    try:
        transactions_json = json.loads(request.form.get('transactions'))
        account_name = request.form.get('Account Name', 'Unknown')
        account_number = request.form.get('Account Number', 'Unknown')
        balance = request.form.get('Balance as of 21 Jul 2026', 'Unknown')
        
        filename = 'edited_statement.pdf'
        c = SimpleDocTemplate(filename, pagesize=letter)
        elements = []
        styles = getSampleStyleSheet()
        
        elements.append(Paragraph("Transaction Report", styles['Heading1']))
        elements.append(Paragraph(f"ANZ BUSINESS ESSENTIALS", styles['Heading2']))
        elements.append(Spacer(1, 20))
        elements.append(Paragraph(f"Account Name: {account_name}", styles['Normal']))
        elements.append(Paragraph(f"Account Number: {account_number}", styles['Normal']))
        elements.append(Paragraph(f"Balance as of 21 Jul 2026: {balance}", styles['Normal']))
        elements.append(Spacer(1, 30))
        
        data = [["Date", "Transaction Details", "Withdrawals", "Deposits"]]
        for t in transactions_json:
            withdrawal = f"${t['withdrawal']:.2f}" if t['withdrawal'] else ""
            deposit = f"${t['deposit']:.2f}" if t['deposit'] else ""
            data.append([t['date'], t['details'], withdrawal, deposit])
        
        table = Table(data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey), ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12), ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ]))
        elements.append(table)
        c.build(elements)
        
        return send_file(filename, as_attachment=True)
    except Exception as e:
        print(f"Error generating final PDF: {e}")
        return "Error generating PDF.", 500

if __name__ == '__main__':
    app.run(debug=True)