import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, ExtractionResult } from '@/types/ExtractedData';

// Configuração correta do worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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
        
        const pageText = textContent.items
          .filter((item: any) => item.str && item.str.trim())
          .map((item: any) => item.str)
          .join(' ');
        
        if (pageText.trim()) {
          fullText += pageText + '\n';
          console.log(`Página ${i} processada. Texto extraído: ${pageText.substring(0, 100)}...`);
        }
      } catch (pageError) {
        console.warn(`Erro ao processar página ${i}:`, pageError);
        // Continua com as outras páginas mesmo se uma der erro
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
  const prompt = `Analise o seguinte texto extraído de um PDF e identifique os seguintes campos específicos. 
Retorne apenas os valores encontrados em formato JSON válido, sem comentários ou texto adicional:

Campos para extrair:
- piNo (P/I No.)
- poNo (P/O No.)
- scNo (S/C No.)
- itemNo (Item No.)
- description (Description)
- quantity (Quantity)
- unitPrice (Unit Price)
- amount (Amount)
- beneficiary (BENEFICIARY)
- nameOfBank (NAME OF THE BANK)
- accountNo (ACCOUNT No.)
- swift (SWIFT, geralmente ZSRCCNBB ou similar)

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
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em extrair dados estruturados de documentos. Retorne sempre JSON válido sem comentários.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
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

// Função de fallback para extração manual básica
const extractDataManually = (text: string): ExtractionResult => {
  const result: ExtractionResult = {};
  
  // Patterns comuns para buscar os campos
  const patterns = {
    piNo: /P\/I\s+No\.?\s*:?\s*([^\n\r]+)/i,
    poNo: /P\/O\s+No\.?\s*:?\s*([^\n\r]+)/i,
    scNo: /S\/C\s+No\.?\s*:?\s*([^\n\r]+)/i,
    itemNo: /Item\s+No\.?\s*:?\s*([^\n\r]+)/i,
    swift: /SWIFT\s*:?\s*([A-Z0-9]+)/i,
    beneficiary: /BENEFICIARY\s*:?\s*([^\n\r]+)/i,
    nameOfBank: /NAME\s+OF\s+THE\s+BANK\s*:?\s*([^\n\r]+)/i,
    accountNo: /ACCOUNT\s+No\.?\s*:?\s*([^\n\r]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result[key as keyof ExtractionResult] = match[1].trim();
    }
  }

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
