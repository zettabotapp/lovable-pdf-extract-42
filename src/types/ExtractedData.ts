
export interface ExtractedData {
  id: string;
  fileName: string;
  piNo: string;
  poNo: string;
  scNo: string;
  itemNo: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  beneficiary: string;
  nameOfBank: string;
  accountNo: string;
  swift: string;
  extractedAt: string;
}

export interface ExtractionResult {
  piNo?: string;
  poNo?: string;
  scNo?: string;
  itemNo?: string;
  description?: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  beneficiary?: string;
  nameOfBank?: string;
  accountNo?: string;
  swift?: string;
}
