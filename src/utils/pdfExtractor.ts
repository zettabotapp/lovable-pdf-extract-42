
import { ExtractedData, ExtractionResult } from '@/types/ExtractedData';
import * as pdfjsLib from 'pdfjs-dist';

// Configuração do worker usando pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    console.log(`Iniciando extração de texto do arquivo: ${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
    
    // Configuração otimizada do PDF.js
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      verbosity: 0,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF carregado com sucesso. Número de páginas: ${pdf.numPages}`);
    
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        console.log(`Processando página ${i}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extrair texto com posicionamento para melhor análise de tabelas
        const textItems = textContent.items
          .filter((item: any) => item.str && item.str.trim())
          .map((item: any) => ({
            text: item.str.trim(),
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height
          }))
          .sort((a, b) => b.y - a.y || a.x - b.x); // Ordenar por linha (y) e depois por coluna (x)
        
        // Agrupar itens por linha (mesmo Y aproximado)
        const lines: any[][] = [];
        let currentLine: any[] = [];
        let lastY = -1;
        const yTolerance = 5; // Tolerância para considerar mesma linha
        
        textItems.forEach(item => {
          if (lastY === -1 || Math.abs(item.y - lastY) <= yTolerance) {
            currentLine.push(item);
          } else {
            if (currentLine.length > 0) {
              lines.push([...currentLine]);
            }
            currentLine = [item];
          }
          lastY = item.y;
        });
        
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        
        // Converter linhas agrupadas em texto
        const pageText = lines
          .map(line => line.map(item => item.text).join(' '))
          .join('\n');
        
        if (pageText.trim()) {
          fullText += pageText + '\n';
          console.log(`Página ${i} processada. Texto extraído: ${pageText.substring(0, 200)}...`);
        }
      } catch (pageError) {
        console.warn(`Erro ao processar página ${i}:`, pageError);
      }
    }

    console.log(`Extração concluída. Total de caracteres: ${fullText.length}`);
    
    if (!fullText.trim()) {
      throw new Error('Nenhum texto foi extraído do PDF. O arquivo pode estar com imagens ou estar protegido.');
    }

    return fullText;
  } catch (error) {
    console.error('Erro detalhado ao extrair texto do PDF:', error);
    throw new Error(`Falha ao extrair texto do PDF: ${error.message || 'Erro desconhecido'}`);
  }
};

export const extractDataWithChatGPT = async (
  pdfText: string,
  apiKey: string
): Promise<ExtractionResult> => {
  const prompt = `Analise o seguinte texto extraído de um PDF de uma fatura (Proforma Invoice) e identifique os seguintes campos específicos.

IMPORTANTE para extração de itens da tabela:
- O "itemNo" deve ser o código da primeira coluna da tabela (ex: 72692-01, 72692-02, etc.)
- A "description" deve incluir TODAS as linhas relacionadas ao item, incluindo:
  * Nome do produto (ex: coffee maker 127V)
  * Serial NO. (se houver)
  * G.W. (Gross Weight)
  * N.W. (Net Weight)
  * TOTAL com informações de CTN
  * Qualquer especificação técnica adicional

Se houver múltiplos itens, extraia apenas o PRIMEIRO item encontrado na tabela.

Retorne apenas os valores encontrados em formato JSON válido, sem comentários ou texto adicional:

Campos para extrair:
- piNo (P/I No.)
- poNo (P/O No.)
- scNo (S/C No.)
- itemNo (código da primeira coluna da tabela de itens)
- description (descrição completa do item incluindo todas as especificações)
- quantity (quantidade do item)
- unitPrice (preço unitário)
- amount (valor total do item)
- beneficiary (BENEFICIARY)
- nameOfBank (NAME OF THE BANK)
- accountNo (ACCOUNT No.)
- swift (SWIFT)

Se algum campo não for encontrado, deixe como string vazia "".

Texto do PDF:
${pdfText}

Responda apenas com o JSON:`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em extrair dados estruturados de faturas e documentos comerciais. Você deve focar especialmente na extração correta de dados de tabelas com múltiplas linhas por item. Retorne sempre JSON válido sem comentários.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erro da API do ChatGPT: ${errorData.error?.message || 'Erro desconhecido'}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('Resposta vazia da API do ChatGPT');
    }

    // Tentar extrair JSON da resposta
    let jsonStr = content.trim();
    
    // Remover possíveis marcadores de código
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsedResult = JSON.parse(jsonStr);
      console.log('Dados extraídos via ChatGPT:', parsedResult);
      return parsedResult;
    } catch (parseError) {
      console.error('Erro ao fazer parse do JSON:', parseError);
      console.log('Resposta original:', content);
      
      // Fallback: tentar extrair campos manualmente
      return extractDataManually(pdfText);
    }
  } catch (error) {
    console.error('Erro na chamada da API do ChatGPT:', error);
    
    // Fallback: extração manual
    return extractDataManually(pdfText);
  }
};

// Função de fallback para extração manual com foco em tabelas
const extractDataManually = (text: string): ExtractionResult => {
  const result: ExtractionResult = {};
  
  console.log('Executando extração manual de dados...');
  
  // Patterns mais específicos para documentos de fatura
  const patterns = {
    piNo: /P\/I\s+No\.?\s*:?\s*([^\s\n\r]+)/i,
    poNo: /P\/O\s+No\.?\s*:?\s*([^\s\n\r]+)/i,
    scNo: /S\/C\s+No\.?\s*:?\s*([^\s\n\r]+)/i,
    swift: /SWIFT\s*:?\s*([A-Z0-9]+)/i,
    beneficiary: /BENEFICIARY\s*:?\s*([^\n\r]+)/i,
    nameOfBank: /NAME\s+OF\s+THE\s+BANK\s*:?\s*([^\n\r]+)/i,
    accountNo: /ACCOUNT\s+No\.?\s*:?\s*([^\s\n\r]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result[key as keyof ExtractionResult] = match[1].trim();
    }
  }

  // Extrair dados da tabela de itens de forma mais específica
  const tableMatch = text.match(/Item\s+No\.[\s\S]*?Commodity\s+&\s+Specifications[\s\S]*?(?=REMARKS|BENEFICIARY|$)/i);
  
  if (tableMatch) {
    const tableText = tableMatch[0];
    console.log('Texto da tabela encontrado:', tableText.substring(0, 300));
    
    // Buscar o primeiro item da tabela (código numérico seguido de hífen)
    const itemMatch = tableText.match(/(\d{5}-\d{2})/);
    if (itemMatch) {
      result.itemNo = itemMatch[1];
      console.log('Item No. extraído:', result.itemNo);
      
      // Extrair descrição completa do item
      const itemStartIndex = tableText.indexOf(itemMatch[1]);
      const remainingTable = tableText.substring(itemStartIndex);
      
      // Buscar padrões de descrição, serial, pesos, etc.
      const descriptionParts: string[] = [];
      
      // Produto principal (coffee maker, etc.)
      const productMatch = remainingTable.match(/coffee\s+maker\s+\d+V/i);
      if (productMatch) {
        descriptionParts.push(productMatch[0]);
      }
      
      // Serial NO.
      const serialMatch = remainingTable.match(/Serial\s+NO\.?\s*:?\s*([^\n\r]+)/i);
      if (serialMatch) {
        descriptionParts.push(`Serial NO.: ${serialMatch[1].trim()}`);
      }
      
      // G.W. e N.W.
      const gwMatch = remainingTable.match(/G\.W\.?\s*:?\s*([\d.]+\s*kgs?)/i);
      if (gwMatch) {
        descriptionParts.push(`G.W.: ${gwMatch[1]}`);
      }
      
      const nwMatch = remainingTable.match(/N\.W\.?\s*:?\s*([\d.]+\s*kgs?)/i);
      if (nwMatch) {
        descriptionParts.push(`N.W.: ${nwMatch[1]}`);
      }
      
      // TOTAL com CTN
      const totalMatch = remainingTable.match(/TOTAL\s*:?\s*([^\n\r]+)/i);
      if (totalMatch) {
        descriptionParts.push(`TOTAL: ${totalMatch[1].trim()}`);
      }
      
      if (descriptionParts.length > 0) {
        result.description = descriptionParts.join(' | ');
        console.log('Descrição extraída:', result.description);
      }
      
      // Extrair quantidade, preço e valor
      const quantityMatch = remainingTable.match(/(\d+(?:\.\d+)?)\s*(?=\s*\$|\s*USD|\s*\d+\.\d+)/);
      if (quantityMatch) {
        result.quantity = quantityMatch[1];
      }
      
      const priceMatch = remainingTable.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?=\s*\$|\s*USD)/);
      if (priceMatch) {
        result.unitPrice = `$${priceMatch[1]}`;
      }
      
      const amountMatch = remainingTable.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (amountMatch) {
        result.amount = `$${amountMatch[1]}`;
      }
    }
  }

  console.log('Resultado da extração manual:', result);
  return result;
};

export const extractDataFromPDF = async (
  file: File,
  apiKey: string
): Promise<ExtractedData> => {
  console.log(`Iniciando extração de dados do arquivo: ${file.name}`);
  
  try {
    // Extrair texto do PDF
    const pdfText = await extractTextFromPDF(file);
    console.log('Texto extraído do PDF:', pdfText.substring(0, 500) + '...');
    
    // Extrair dados usando ChatGPT
    const extractedFields = await extractDataWithChatGPT(pdfText, apiKey);
    console.log('Campos extraídos:', extractedFields);

    // Montar o objeto final
    const extractedData: ExtractedData = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      fileName: file.name,
      piNo: extractedFields.piNo || '',
      poNo: extractedFields.poNo || '',
      scNo: extractedFields.scNo || '',
      itemNo: extractedFields.itemNo || '',
      description: extractedFields.description || '',
      quantity: extractedFields.quantity || '',
      unitPrice: extractedFields.unitPrice || '',
      amount: extractedFields.amount || '',
      beneficiary: extractedFields.beneficiary || '',
      nameOfBank: extractedFields.nameOfBank || '',
      accountNo: extractedFields.accountNo || '',
      swift: extractedFields.swift || '',
      extractedAt: new Date().toISOString(),
    };

    return extractedData;
  } catch (error) {
    console.error('Erro na extração de dados:', error);
    throw error;
  }
};
