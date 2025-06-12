
import * as XLSX from 'xlsx';
import { ExtractedData } from '@/types/ExtractedData';

export const exportToExcel = (data: ExtractedData[]): void => {
  try {
    // Preparar os dados para exportação
    const exportData = data.map((item, index) => ({
      'Nº': index + 1,
      'Nome do Arquivo': item.fileName,
      'P/I No.': item.piNo,
      'P/O No.': item.poNo,
      'S/C No.': item.scNo,
      'Item No.': item.itemNo,
      'Description': item.description,
      'Quantity': item.quantity,
      'Unit Price': item.unitPrice,
      'Amount': item.amount,
      'BENEFICIARY': item.beneficiary,
      'NAME OF THE BANK': item.nameOfBank,
      'ACCOUNT No.': item.accountNo,
      'SWIFT': item.swift,
      'Data de Extração': new Date(item.extractedAt).toLocaleString('pt-BR'),
    }));

    // Criar workbook
    const wb = XLSX.utils.book_new();
    
    // Criar worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Configurar largura das colunas
    const columnWidths = [
      { wch: 5 },   // Nº
      { wch: 25 },  // Nome do Arquivo
      { wch: 15 },  // P/I No.
      { wch: 15 },  // P/O No.
      { wch: 15 },  // S/C No.
      { wch: 12 },  // Item No.
      { wch: 30 },  // Description
      { wch: 12 },  // Quantity
      { wch: 15 },  // Unit Price
      { wch: 15 },  // Amount
      { wch: 25 },  // BENEFICIARY
      { wch: 25 },  // NAME OF THE BANK
      { wch: 20 },  // ACCOUNT No.
      { wch: 15 },  // SWIFT
      { wch: 20 },  // Data de Extração
    ];
    ws['!cols'] = columnWidths;

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Dados Extraídos');

    // Criar segunda aba com resumo
    const summaryData = [
      { Campo: 'Total de Arquivos Processados', Valor: data.length },
      { Campo: 'Data da Exportação', Valor: new Date().toLocaleString('pt-BR') },
      { Campo: 'Arquivos com P/I No.', Valor: data.filter(item => item.piNo).length },
      { Campo: 'Arquivos com P/O No.', Valor: data.filter(item => item.poNo).length },
      { Campo: 'Arquivos com S/C No.', Valor: data.filter(item => item.scNo).length },
      { Campo: 'Arquivos com Beneficiário', Valor: data.filter(item => item.beneficiary).length },
      { Campo: 'Arquivos com Dados Bancários', Valor: data.filter(item => item.nameOfBank || item.accountNo).length },
    ];

    const summaryWs = XLSX.utils.json_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumo');

    // Gerar nome do arquivo
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const fileName = `dados_extraidos_pdfs_${timestamp}.xlsx`;

    // Fazer download
    XLSX.writeFile(wb, fileName);
    
    console.log(`Arquivo Excel exportado: ${fileName}`);
  } catch (error) {
    console.error('Erro ao exportar para Excel:', error);
    throw new Error('Falha ao exportar dados para Excel');
  }
};
