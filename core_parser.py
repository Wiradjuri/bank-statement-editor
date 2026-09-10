import pdfplumber
import pandas as pd
import re

class BankParser:
    def __init__(self, file_path, bank_type='generic'):
        self.file_path = file_path
        self.bank_type = bank_type
        # Define specific column headers or regions if needed
        self.templates = {
            'chase': {'header_row': 0},
            'hsbc': {'header_row': 1},
            'generic': {'header_row': 0}
        }

    def get_cleaned_dataframe(self):
        """Extracts tables and cleans them into a standardized format."""
        all_data = []
        with pdfplumber.open(self.file_path) as pdf:
            for page in pdf.pages:
                table = page.extract_table()
                if table:
                    df = pd.DataFrame(table[1:], columns=table[0])
                    all_data.append(df)
        
        if not all_data:
            return pd.DataFrame()
            
        full_df = pd.concat(all_data, ignore_index=True)
        return self._clean_data(full_df)

    def _clean_data(self, df):
        """Standardizes currency and date formats."""
        # Remove empty rows
        df = df.dropna(how='all')
        
        # Example cleaning: convert currency strings to numeric
        for col in df.columns:
            if 'Amount' in col or 'Withdrawal' in col or 'Deposit' in col:
                df[col] = df[col].replace(r'[\$,]', '', regex=True).astype(float)
        
        return df