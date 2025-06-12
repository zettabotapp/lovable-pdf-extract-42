import { ExtractedData, ExtractionResult } from '@/types/ExtractedData';
import * as pdfjsLib from 'pdfjs-dist';

// Usar o worker do CDN para evitar problemas de CORS
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

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
  const prompt = `Analise o seguinte texto extraído de um PDF de invoice/proforma e identifique os seguintes campos específicos. 
Retorne apenas os valores encontrados em formato JSON válido, sem comentários ou texto adicional:

INSTRUÇÕES IMPORTANTES:
- Para "itemNo": extraia TODOS os códigos de item da primeira coluna da tabela de produtos (ex: 72692-01, 72692-02, etc.). Se houver múltiplos itens, separe por vírgula.
- Para "description": extraia TODA a descrição completa de cada item, incluindo múltiplas linhas (ex: "coffee maker 127V, Serial NO.: 127V: 00048661-24B00 TO 00052520-24B00, G.W.: 1.369kgs, N.W.: 0.948kgs, TOTAL: 911 CTNS 68.5 CBM; coffee maker 220V, Serial NO.: 220V: 00033331-24B00 TO 00035329-24B00"). Combine todas as informações relacionadas a cada produto.
- Para "quantity": extraia todas as quantidades dos produtos (ex: "3.465, 1.999").
- Para "unitPrice": extraia todos os preços unitários (ex: "$4.290, $4.290").
- Para "amount": extraia todos os valores totais (ex: "$14.877.72, $8.571.42").

Campos para extrair:
- piNo (P/I No.)
- poNo (P/O No.)
- scNo (S/C No.)
- itemNo (códigos dos produtos da primeira coluna da tabela)
- description (descrição completa de todos os produtos, incluindo especificações técnicas)
- quantity (quantidades de todos os produtos)
- unitPrice (preços unitários de todos os produtos)
- amount (valores totais de todos os produtos)
- beneficiary (BENEFICIARY)
- nameOfBank (NAME OF THE BANK)
- accountNo (ACCOUNT No.)
- swift (SWIFT code)

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
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em extrair dados estruturados de documentos de invoice/proforma. Foque em extrair TODOS os itens da tabela de produtos, não apenas o primeiro. Retorne sempre JSON válido sem comentários.'
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

// Função de fallback para extração manual melhorada
const extractDataManually = (text: string): ExtractionResult => {
  const result: ExtractionResult = {};
  
  // Patterns para buscar os campos básicos
  const basicPatterns = {
    piNo: /P\/I\s+No\.?\s*:?\s*([^\n\r]+)/i,
    poNo: /P\/O\s+No\.?\s*:?\s*([^\n\r]+)/i,
    scNo: /S\/C\s+No\.?\s*:?\s*([^\n\r]+)/i,
    swift: /SWIFT\s*:?\s*([A-Z0-9]+)/i,
    beneficiary: /BENEFICIARY\s*:?\s*([^\n\r]+)/i,
    nameOfBank: /NAME\s+OF\s+THE\s+BANK\s*:?\s*([^\n\r]+)/i,
    accountNo: /ACCOUNT\s+No\.?\s*:?\s*([^\n\r]+)/i,
  };

  // Extrair campos básicos
  for (const [key, pattern] of Object.entries(basicPatterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result[key as keyof ExtractionResult] = match[1].trim();
    }
  }

  // Extrair dados da tabela de produtos de forma mais inteligente
  try {
    // Buscar por códigos de item (padrão numérico-numérico como 72692-01)
    const itemCodes = text.match(/\b\d{4,6}-\d{2}\b/g);
    if (itemCodes && itemCodes.length > 0) {
      result.itemNo = itemCodes.join(', ');
    }

    // Buscar por descrições de produtos (palavras após códigos de item)
    const productDescriptions = [];
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Se a linha contém um código de item
      if (/\b\d{4,6}-\d{2}\b/.test(line)) {
        let description = '';
        // Pegar a descrição na mesma linha após o código
        const parts = line.split(/\b\d{4,6}-\d{2}\b/);
        if (parts.length > 1) {
          description = parts[1].trim();
        }
        
        // Verificar linhas seguintes para informações adicionais (Serial NO., G.W., etc.)
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine.match(/(Serial NO|G\.W\.|N\.W\.|TOTAL)/i)) {
            description += ', ' + nextLine;
          } else if (nextLine.length > 0 && !nextLine.match(/^\d+[\.\,]?\d*\s*\$?\d/)) {
            // Se não é uma linha de números/preços, pode ser continuação da descrição
            if (nextLine.length < 50) { // Evitar pegar linhas muito longas que não são descrições
              description += ', ' + nextLine;
            }
          } else {
            break;
          }
        }
        
        if (description) {
          productDescriptions.push(description.trim());
        }
      }
    }
    
    if (productDescriptions.length > 0) {
      result.description = productDescriptions.join('; ');
    }

    // Buscar quantidades (números seguidos de unidades ou separados por espaços)
    const quantities = text.match(/\b\d{1,3}[\.,]?\d{0,3}\b(?=\s*\$?\d+[\.,]\d+)/g);
    if (quantities && quantities.length > 0) {
      result.quantity = quantities.join(', ');
    }

    // Buscar preços unitários ($ seguido de números)
    const unitPrices = text.match(/\$\d+[\.,]?\d*/g);
    if (unitPrices && unitPrices.length > 0) {
      result.unitPrice = unitPrices.join(', ');
    }

    // Buscar valores totais ($ seguido de números maiores)
    const amounts = text.match(/\$\d{2,}[\.,]?\d*/g);
    if (amounts && amounts.length > 0) {
      result.amount = amounts.join(', ');
    }

  } catch (error) {
    console.warn('Erro na extração manual da tabela:', error);
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
