
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

INSTRUÇÕES ESPECÍFICAS PARA EXTRAÇÃO DA TABELA DE PRODUTOS:
- Para "itemNo": extraia APENAS os códigos da primeira coluna da tabela (exemplo: "72692-01, 72692-02"). Estes códigos ficam na coluna "Item No." e são diferentes de códigos como "C-30-18X".
- Para "description": para cada item code encontrado, extraia TODA a descrição associada, incluindo todas as linhas subsequentes até o próximo item code. Combine: nome do produto + Serial NO. + especificações técnicas (G.W., N.W., TOTAL, etc.).
- Para "quantity": extraia as quantidades correspondentes a cada item code (exemplo: "3.465, 1.999").
- Para "unitPrice": extraia os preços unitários na coluna "Unit Price" (exemplo: "$4.290, $4.290").
- Para "amount": extraia os valores totais na coluna "Amount" (exemplo: "$14.877.72, $8.571.42").

EXEMPLO DE ESTRUTURA DA TABELA:
Item No. | Commodity & Specifications | Quantity | Unit Price | Amount
72692-01 | coffee maker 127V | 3.465 | $4.290 | $14.877.72
         | Serial NO.: 127V: 00048661-24B00 TO 00052520-24B00
         | G.W.: 1.369kgs, N.W.: 0.948kgs
72692-02 | coffee maker 220V | 1.999 | $4.290 | $8.571.42
         | Serial NO.: 220V: 00033331-24B00 TO 00035329-24B00

Campos para extrair:
- piNo (P/I No.)
- poNo (P/O No.)
- scNo (S/C No.)
- itemNo (códigos da primeira coluna "Item No.")
- description (descrição completa incluindo todas as linhas de cada item)
- quantity (quantidades de cada item)
- unitPrice (preços unitários de cada item)
- amount (valores totais de cada item)
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
        model: 'gpt-4o-2024-11-20',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em extrair dados estruturados de documentos de invoice/proforma. Foque especialmente em extrair TODOS os item codes da primeira coluna da tabela (como 72692-01, 72692-02) e suas descrições completas incluindo Serial NO., especificações técnicas, etc. Retorne sempre JSON válido sem comentários.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
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
      console.log('Resultado parseado do ChatGPT:', parsedResult);
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
  console.log('Iniciando extração manual...');
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
    console.log('Extraindo dados da tabela...');
    
    // Buscar por códigos de item na primeira coluna (padrão como 72692-01, 72692-02)
    const itemCodeMatches = text.match(/\b\d{5}-\d{2}\b/g);
    if (itemCodeMatches && itemCodeMatches.length > 0) {
      result.itemNo = itemCodeMatches.join(', ');
      console.log('Item codes encontrados:', result.itemNo);
    }

    // Extrair descrições, quantidades, preços e valores de forma estruturada
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const productDescriptions = [];
    const quantities = [];
    const unitPrices = [];
    const amounts = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Se encontrar um código de item (como 72692-01)
      if (/\b\d{5}-\d{2}\b/.test(line)) {
        console.log(`Processando linha com item code: ${line}`);
        
        let description = '';
        let quantity = '';
        let unitPrice = '';
        let amount = '';
        
        // Extrair descrição inicial da mesma linha
        const parts = line.split(/\b\d{5}-\d{2}\b/);
        if (parts.length > 1) {
          const restOfLine = parts[1].trim();
          
          // Tentar extrair quantidade, preço e valor da mesma linha
          const priceMatch = restOfLine.match(/\$(\d+[\.,]?\d*)/g);
          const quantityMatch = restOfLine.match(/(\d+[\.,]?\d+)(?=\s*\$)/);
          
          if (quantityMatch) {
            quantity = quantityMatch[1];
          }
          
          if (priceMatch && priceMatch.length >= 1) {
            unitPrice = priceMatch[0];
            if (priceMatch.length >= 2) {
              amount = priceMatch[1];
            }
          }
          
          // Extrair descrição (parte antes dos números)
          description = restOfLine.replace(/\d+[\.,]?\d*\s*\$\d+[\.,]?\d*/g, '').trim();
        }
        
        // Coletar linhas seguintes que fazem parte da descrição do item
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j].trim();
          
          // Parar se encontrar outro item code
          if (/\b\d{5}-\d{2}\b/.test(nextLine)) {
            break;
          }
          
          // Se a linha contém informações do produto (Serial NO., G.W., etc.)
          if (nextLine.match(/(Serial\s+NO|G\.W\.|N\.W\.|TOTAL|coffee\s+maker)/i)) {
            if (description) {
              description += ', ' + nextLine;
            } else {
              description = nextLine;
            }
          }
          
          // Se não encontrou quantidade ainda, tentar extrair da linha atual
          if (!quantity) {
            const qtyMatch = nextLine.match(/(\d+[\.,]?\d+)(?=\s*\$)/);
            if (qtyMatch) {
              quantity = qtyMatch[1];
            }
          }
          
          // Se não encontrou preços ainda, tentar extrair da linha atual
          if (!unitPrice || !amount) {
            const priceMatches = nextLine.match(/\$(\d+[\.,]?\d*)/g);
            if (priceMatches) {
              if (!unitPrice && priceMatches.length >= 1) {
                unitPrice = priceMatches[0];
              }
              if (!amount && priceMatches.length >= 2) {
                amount = priceMatches[1];
              } else if (!amount && priceMatches.length === 1 && unitPrice) {
                amount = priceMatches[0];
              }
            }
          }
        }
        
        if (description) {
          productDescriptions.push(description.trim());
        }
        if (quantity) {
          quantities.push(quantity);
        }
        if (unitPrice) {
          unitPrices.push(unitPrice);
        }
        if (amount) {
          amounts.push(amount);
        }
      }
    }
    
    if (productDescriptions.length > 0) {
      result.description = productDescriptions.join('; ');
      console.log('Descrições extraídas:', result.description);
    }
    
    if (quantities.length > 0) {
      result.quantity = quantities.join(', ');
      console.log('Quantidades extraídas:', result.quantity);
    }
    
    if (unitPrices.length > 0) {
      result.unitPrice = unitPrices.join(', ');
      console.log('Preços unitários extraídos:', result.unitPrice);
    }
    
    if (amounts.length > 0) {
      result.amount = amounts.join(', ');
      console.log('Valores totais extraídos:', result.amount);
    }

  } catch (error) {
    console.warn('Erro na extração manual da tabela:', error);
  }

  console.log('Resultado final da extração manual:', result);
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
