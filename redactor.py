import fitz  # PyMuPDF

class StatementRedactor:
    def __init__(self, file_path):
        self.file_path = file_path

    def apply(self, pattern, output_path):
        """Redacts text matching the pattern (or account number) from the PDF."""
        doc = fitz.open(self.file_path)
        for page in doc:
            # Find instances of the pattern
            text_instances = page.search_for(pattern)
            for inst in text_instances:
                page.add_redact_annot(inst, fill=(0, 0, 0))
            page.apply_redactions()
        doc.save(output_path)
        doc.close()