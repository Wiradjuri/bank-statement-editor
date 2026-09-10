
import os
import time
from functools import wraps
import json
import base64
import argparse
import sys
from concurrent.futures import ThreadPoolExecutor
from core_parser import BankParser
from redactor import StatementRedactor
from flask import Flask, request, render_template, send_file, jsonify
import pytesseract
from PIL import Image, ImageDraw, ImageFont
import cv2
import numpy as np
import pymupdf
from pdf2image import convert_from_path
from openai import OpenAI
from dotenv import load_dotenv
from reportlab.lib.pagesizes import letter  # pyright: ignore[reportMissingModuleSource]
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

def main():
    parser = argparse.ArgumentParser(description="Bank Statement Editor & Manipulator CLI")
    
    # Input/Output Arguments
    parser.add_argument('--input', type=str, required=True, help='Path to the source PDF')
    parser.add_argument('--output', type=str, help='Output filename')
    parser.add_argument('--format', choices=['csv', 'xlsx', 'json'], default='csv', help='Export format')
    
    # Manipulation Arguments
    parser.add_argument('--redact', type=str, help='Pattern or Account Number to redact')
    parser.add_argument('--bank', choices=['chase', 'hsbc', 'barclays', 'generic'], default='generic', help='Bank template')

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: File {args.input} not found.")
        sys.exit(1)

    # 1. Initialize Parser with Template Logic
    processor = BankParser(args.input, bank_type=args.bank)
    
    # 2. Extract and Clean Data
    print(f"[*] Extracting data using {args.bank} template...")
    data = processor.get_cleaned_dataframe()

    # 3. Handle Redaction if requested
    if args.redact:
        print(f"[*] Redacting sensitive info: {args.redact}")
        redactor = StatementRedactor(args.input)
        redacted_path = f"redacted_{args.input}"
        redactor.apply(args.redact, redacted_path)
        print(f"[+] Redacted PDF saved to {redacted_path}")

    # 4. Export Data
    output_file = args.output if args.output else f"extracted_data.{args.format}"
    if args.format == 'csv':
        data.to_csv(output_file, index=False)
    elif args.format == 'xlsx':
        data.to_excel(output_file, index=False)
    
    print(f"[+] Success! Data exported to {output_file}")

# --- Configuration ---
# Load environment variables from .env file
load_dotenv()

# --- Model Configuration ---
# Override these values in .env when the provider retires or replaces a model.
MODEL_CONFIG = {
    "text_extraction": os.environ.get("TEXT_MODEL", "llama-3-3-70b"),
    "vision": os.environ.get("VISION_MODEL", "gemini-3-6-flash"),
}
TEXT_MODEL_CHAIN = [
    MODEL_CONFIG["text_extraction"],
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "qwen/qwen2.5-72b-instruct",
    MODEL_CONFIG["vision"],
]
TEXT_MODEL_CHAIN = list(dict.fromkeys(model for model in TEXT_MODEL_CHAIN if model))

try:
    client = OpenAI(
        api_key=os.environ.get("NVIDIA_API_KEY"),
        base_url="https://integrate.api.nvidia.com/v1",
        timeout=30.0,
    )
except Exception as e:
    print(f"Error initializing NVIDIA API client: {e}")
    print("Please ensure you have set your NVIDIA_API_KEY in your .env file.")
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
    """Create high-resolution page images for the complete document."""
    if filename.lower().endswith('.pdf'):
        try:
            pages = convert_from_path(file_path, 300)
            if not pages:
                return []
            processed_paths = []
            stem = os.path.splitext(filename)[0]
            for page_number, page_image in enumerate(pages):
                processed_filename = f'{stem}_page_{page_number + 1}.png'
                processed_path = os.path.join(app.config['PROCESSED_FOLDER'], processed_filename)
                page_image.save(processed_path, 'PNG')
                processed_paths.append(processed_path)
            return processed_paths
        except Exception as e:
            print(f"Error converting PDF: {e}")
            return []
    else:
        processed_path = os.path.join(app.config['PROCESSED_FOLDER'], filename)
        Image.open(file_path).save(processed_path)
        return [processed_path]

def encode_image(image_path):
    """Encodes an image file to a base64 string for the NVIDIA API."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def parse_json_response(content):
    """Parse the first JSON value from plain, fenced, or verbose model output."""
    if not content:
        raise ValueError("Model returned an empty response.")

    if not isinstance(content, str):
        content = str(content)
    cleaned = content.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()

    decoder = json.JSONDecoder()
    candidates = [cleaned]
    object_start = cleaned.find("{")
    if object_start >= 0:
        candidates.append(cleaned[object_start:])
    array_start = cleaned.find("[")
    if array_start >= 0:
        candidates.append(cleaned[array_start:])

    last_error = None
    for candidate in candidates:
        try:
            value, _ = decoder.raw_decode(candidate.lstrip())
            return value
        except json.JSONDecodeError as error:
            last_error = error
    raise ValueError(f"Model response did not contain valid JSON: {last_error}")

def call_llm_with_fallback(prompt, is_json=True):
    """Call NVIDIA text models in priority order, skipping retired models."""
    if not client:
        return None

    last_error = None
    for model_name in TEXT_MODEL_CHAIN:
        try:
            request = {
                "model": model_name,
                "messages": [{"role": "user", "content": prompt}],
            }
            if is_json:
                try:
                    response = client.chat.completions.create(
                        **request, response_format={"type": "json_object"}, timeout=30
                    )
                except Exception as error:
                    # Some compatible endpoints reject response_format while
                    # still supporting the same chat request without it.
                    if not any(token in str(error).lower() for token in (
                        "response_format", "json_object", "unsupported", "400"
                    )):
                        raise
                    response = client.chat.completions.create(**request, timeout=30)
            else:
                response = client.chat.completions.create(**request, timeout=30)

            content = response.choices[0].message.content
            if not content:
                raise ValueError("Model returned an empty response.")
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            elif content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            return content.strip()
        except Exception as error:
            error_text = str(error)
            last_error = error
            if "410" in error_text or "404" in error_text or "Gone" in error_text:
                print(f"[!] NVIDIA model {model_name} unavailable; trying next.")
                continue
            print(f"[!] NVIDIA request failed on {model_name}: {error}")
            break

    print(f"[X] All NVIDIA text models failed. Last error: {last_error}")
    return None

def identify_fields_with_ai(full_text):
    """Uses an LLM (via NVIDIA) to identify key-value pairs from document text."""
    if not client:
        print("NVIDIA client not initialized. Skipping AI field identification.")
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
        content = call_llm_with_fallback(prompt)
        if not content:
            return {}
        return parse_json_response(content)
    except Exception as e:
        print(f"Error calling NVIDIA API for field identification: {e}")
        return {}

def find_coordinates_with_ai(image_path, field_name):
    """Uses an LLM with vision (via NVIDIA) to find the coordinates of a field's value."""
    if not client:
        print("NVIDIA client not initialized. Skipping AI coordinate finding.")
        return None
    prompt = f"""
    Analyze the provided image. I need you to find the pixel coordinates of the VALUE for the field named "{field_name}".
    The field name is the label. The value is the data next to it.
    Please provide the coordinates of the bounding box around the VALUE ONLY. Return the result as a JSON object with keys: x, y, width, height.
    If you cannot find the field, return an empty JSON object {{}}.
    """
    try:
        request = {
            "model": MODEL_CONFIG["vision"],
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encode_image(image_path)}"}},
                    ],
                }
            ],
        }
        try:
            response = client.chat.completions.create(
                **request, response_format={"type": "json_object"}, timeout=30
            )
        except Exception:
            response = client.chat.completions.create(**request, timeout=30)
        return parse_json_response(response.choices[0].message.content)
    except Exception as e:
        print(f"Error calling NVIDIA Vision API for coordinate finding: {e}")
        return None

def find_transaction_table_with_ai(image_path):
    """Find the transaction table bounds so edited rows can be redrawn in place."""
    if not client:
        return None
    prompt = """
    Analyze this bank statement image and locate the complete transaction table,
    including its header and all visible transaction rows. Return ONLY a JSON
    object with numeric x, y, width, and height pixel coordinates. If there is
    no transaction table on this page, return {}.
    """
    try:
        request = {
            "model": MODEL_CONFIG["vision"],
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/png;base64,{encode_image(image_path)}"
                    }},
                ],
            }],
        }
        try:
            response = client.chat.completions.create(
                **request, response_format={"type": "json_object"}, timeout=30
            )
        except Exception:
            response = client.chat.completions.create(**request, timeout=30)
        table = parse_json_response(response.choices[0].message.content)
        if all(key in table for key in ('x', 'y', 'width', 'height')):
            return table
    except Exception as e:
        print(f"Error finding NVIDIA transaction table coordinates: {e}")
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
        content = call_llm_with_fallback(prompt)
        if not content:
            return []
        return parse_json_response(content)
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
        content = call_llm_with_fallback(prompt)
        if not content:
            raise RuntimeError("All configured NVIDIA models failed.")
        analysis = parse_json_response(content)
        required_keys = ["total_deposits", "total_withdrawals", "net_cash_flow", "concerns", "verdict", "suggestions"]
        if not all(key in analysis for key in required_keys):
            raise ValueError("Parsed JSON is missing required keys.")
        return analysis
    except Exception as e:
        print(f"Error calling NVIDIA API for financial analysis: {e}")
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
        processed_image_paths = preprocess_file(filepath, file.filename)
        if not processed_image_paths:
            return "Could not process PDF file.", 500

        print(f"[*] OCR: processing {len(processed_image_paths)} page(s)")
        with ThreadPoolExecutor(max_workers=min(4, len(processed_image_paths))) as executor:
            page_texts = list(executor.map(
                lambda path: pytesseract.image_to_string(Image.open(path)),
                processed_image_paths,
            ))
        full_text = "\n\n--- PAGE BREAK ---\n\n".join(page_texts)

        # These calls are independent. Running them together avoids making the
        # upload request wait for three full model round trips in sequence.
        print("[*] AI: starting field, transaction, and analysis requests")
        with ThreadPoolExecutor(max_workers=3) as executor:
            fields_future = executor.submit(identify_fields_with_ai, full_text)
            transactions_future = executor.submit(extract_transactions, full_text)
            analysis_future = executor.submit(analyze_financial_health, full_text)
            extracted_data = fields_future.result()
            transactions = transactions_future.result()
            financial_analysis = analysis_future.result()
        print("[*] AI: text requests complete")

        coords_cache = {}
        if extracted_data:
            page_search_text = [text.lower() for text in page_texts]

            def likely_field_pages(field_name, field_value):
                terms = [str(field_name).lower(), str(field_value).lower()]
                matches = [
                    page_number
                    for page_number, text in enumerate(page_search_text)
                    if any(term and term in text for term in terms)
                ]
                return matches or list(range(len(processed_image_paths)))

            coordinate_jobs = [
                (field_name, page_number, page_path)
                for field_name in extracted_data
                for page_number in likely_field_pages(
                    field_name, extracted_data[field_name]
                )
                for page_path in [processed_image_paths[page_number]]
            ]

            def locate_field_page(job):
                field_name, page_number, page_path = job
                print(f"[*] Vision: {field_name} page {page_number + 1}")
                coords = find_coordinates_with_ai(page_path, field_name)
                return field_name, page_number, coords

            with ThreadPoolExecutor(max_workers=min(8, len(coordinate_jobs))) as executor:
                coordinate_results = list(executor.map(locate_field_page, coordinate_jobs))
            for field_name in extracted_data:
                matches = [
                    (page_number, coords)
                    for result_field, page_number, coords in coordinate_results
                    if result_field == field_name and coords and 'x' in coords
                ]
                if matches:
                    page_number, coords = min(matches, key=lambda match: match[0])
                    coords_cache[field_name] = {**coords, 'page': page_number}
            print(f"[*] Vision: mapped {len(coords_cache)} field(s)")

        likely_table_pages = [
            page_number
            for page_number, text in enumerate(page_search_text)
            if any(term in text for term in (
                'transaction', 'withdrawal', 'deposit', 'description', 'date'
            ))
        ] if extracted_data else list(range(len(processed_image_paths)))
        likely_table_pages = likely_table_pages or list(range(len(processed_image_paths)))

        def locate_table(page_info):
            page_number, page_path = page_info
            table = find_transaction_table_with_ai(page_path)
            return {**table, 'page': page_number} if table else None

        table_coords = None
        with ThreadPoolExecutor(max_workers=min(4, len(processed_image_paths))) as executor:
            for candidate in executor.map(
                locate_table,
                ((page_number, processed_image_paths[page_number])
                 for page_number in likely_table_pages),
            ):
                if candidate and table_coords is None:
                    table_coords = candidate

        return render_template('edit.html', 
                               data=extracted_data, 
                               transactions=transactions,
                               image_filenames=[os.path.basename(path) for path in processed_image_paths],
                               source_filename=os.path.basename(file.filename),
                               coords=coords_cache,
                               table_coords=table_coords or {},
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
        source_filename = os.path.basename(request.form.get('source_filename', ''))
        image_filenames = [
            os.path.basename(name)
            for name in json.loads(request.form.get('image_filenames', '[]'))
        ]
        coords = json.loads(request.form.get('coords', '{}'))
        table_coords = json.loads(request.form.get('table_coords', '{}'))
        source_path = os.path.join(app.config['UPLOAD_FOLDER'], source_filename)
        if not os.path.isfile(source_path):
            raise FileNotFoundError('The original uploaded document is no longer available.')

        output_path = os.path.join(app.config['OUTPUT_FOLDER'], 'edited_statement.pdf')
        if source_filename.lower().endswith('.pdf'):
            document = pymupdf.open(source_path)
        else:
            document = pymupdf.open()
            image = pymupdf.Pixmap(source_path)
            page = document.new_page(width=image.width * 72 / 300, height=image.height * 72 / 300)
            page.insert_image(page.rect, filename=source_path)

        for field_name, field_coords in coords.items():
            field_value = request.form.get(field_name)
            page_number = int(field_coords.get('page', 0))
            if (
                field_value is None
                or page_number < 0
                or page_number >= document.page_count
                or not all(key in field_coords for key in ('x', 'y', 'width', 'height'))
            ):
                continue
            page = document[page_number]
            image_path = os.path.join(app.config['PROCESSED_FOLDER'], image_filenames[page_number])
            image = Image.open(image_path)
            scale_x = page.rect.width / image.width
            scale_y = page.rect.height / image.height
            rect = pymupdf.Rect(
                field_coords['x'] * scale_x,
                field_coords['y'] * scale_y,
                (field_coords['x'] + field_coords['width']) * scale_x,
                (field_coords['y'] + field_coords['height']) * scale_y,
            )
            page.add_redact_annot(rect, fill=(1, 1, 1))
            page.apply_redactions()
            page.insert_textbox(
                rect, field_value, fontsize=max(6, rect.height * 0.75),
                fontname='helv', color=(0, 0, 0), align=0
            )

        if table_coords and transactions_json and image_filenames:
            page_number = int(table_coords.get('page', 0))
            if 0 <= page_number < document.page_count and all(
                key in table_coords for key in ('x', 'y', 'width', 'height')
            ):
                page = document[page_number]
                image_path = os.path.join(
                    app.config['PROCESSED_FOLDER'], image_filenames[page_number]
                )
                image = Image.open(image_path)
                scale_x = page.rect.width / image.width
                scale_y = page.rect.height / image.height
                table_rect = pymupdf.Rect(
                    table_coords['x'] * scale_x,
                    table_coords['y'] * scale_y,
                    (table_coords['x'] + table_coords['width']) * scale_x,
                    (table_coords['y'] + table_coords['height']) * scale_y,
                )
                page.add_redact_annot(table_rect, fill=(1, 1, 1))
                page.apply_redactions()
                row_height = table_rect.height / (len(transactions_json) + 1)
                page.draw_rect(table_rect, color=(0.65, 0.65, 0.65), width=0.5)
                for row_index, transaction in enumerate(transactions_json):
                    y = table_rect.y0 + row_height * (row_index + 1)
                    page.draw_line(
                        pymupdf.Point(table_rect.x0, y),
                        pymupdf.Point(table_rect.x1, y),
                        color=(0.75, 0.75, 0.75), width=0.35
                    )
                    values = [
                        str(transaction.get('date', '')),
                        str(transaction.get('details', transaction.get('description', ''))),
                        str(transaction.get('withdrawal', '') or ''),
                        str(transaction.get('deposit', '') or ''),
                    ]
                    column_width = table_rect.width / len(values)
                    for column_index, value in enumerate(values):
                        cell = pymupdf.Rect(
                            table_rect.x0 + column_index * column_width + 3,
                            y + 2,
                            table_rect.x0 + (column_index + 1) * column_width - 3,
                            y + row_height - 2,
                        )
                        page.insert_textbox(
                            cell, value, fontsize=max(5, row_height * 0.32),
                            fontname='helv', color=(0, 0, 0), align=0
                        )

        document.save(output_path, garbage=4, deflate=True)
        document.close()
        return send_file(output_path, as_attachment=True, download_name='edited_statement.pdf')
    except Exception as e:
        print(f"Error generating final PDF: {e}")
        return "Error generating PDF.", 500

if __name__ == '__main__':
    app.run(debug=False, threaded=True)