
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

INSTRUÇÕES CRÍTICAS PARA EXTRAÇÃO DE DADOS DA TABELA:
1. O "itemNo" deve ser extraído da PRIMEIRA COLUNA da tabela (Item No.), não da descrição
2. Procure por códigos como "72692-01", "72692-02" etc. na primeira coluna
3. A "description" deve incluir TODAS as linhas da segunda coluna (Commodity & Specifications) relacionadas ao primeiro item encontrado:
   - Nome do produto (ex: coffee maker 127V, coffee maker 220V)
   - Serial NO. com todos os números seriais listados
   - G.W. (Gross Weight) - peso bruto
   - N.W. (Net Weight) - peso líquido 
   - Total G.W. e Total N.W.
   - TOTAL com informações de CTN e CBM
   - Qualquer especificação técnica adicional

IMPORTANTE: Extraia apenas o PRIMEIRO item encontrado na tabela. Se houver múltiplos itens (72692-01, 72692-02, etc.), extraia somente os dados do primeiro (72692-01).

Retorne apenas os valores encontrados em formato JSON válido, sem comentários ou texto adicional:

Campos para extrair:
- piNo (P/I No.)
- poNo (P/O No.)
- scNo (S/C No.)
- itemNo (código da PRIMEIRA coluna da tabela - ex: 72692-01)
- description (descrição COMPLETA do primeiro item incluindo todas as especificações técnicas da segunda coluna)
- quantity (quantidade do primeiro item)
- unitPrice (preço unitário do primeiro item)
- amount (valor total do primeiro item)
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
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em extrair dados estruturados de faturas e documentos comerciais. Você deve focar especialmente na extração correta de códigos de itens da primeira coluna da tabela e capturar todas as especificações técnicas relacionadas a cada item. Retorne sempre JSON válido sem comentários.'
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

// Função de fallback para extração manual com foco em tabelas estruturadas
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

  // Extrair dados da tabela de itens focando na estrutura correta
  const tableMatch = text.match(/Item\s+No\.[\s\S]*?Commodity\s+&\s+Specifications[\s\S]*?(?=REMARKS|BENEFICIARY|\$.*DOLLARS|$)/i);
  
  if (tableMatch) {
    const tableText = tableMatch[0];
    console.log('Texto da tabela encontrado:', tableText.substring(0, 500));
    
    // Buscar o primeiro código de item na primeira coluna (formato XXXXX-XX)
    const itemCodePattern = /(\d{5}-\d{2})/g;
    const itemMatches = Array.from(tableText.matchAll(itemCodePattern));
    
    if (itemMatches.length > 0) {
      // Pegar o primeiro item encontrado
      const firstItemCode = itemMatches[0][1];
      result.itemNo = firstItemCode;
      console.log('Item No. extraído:', result.itemNo);
      
      // Encontrar a posição do primeiro item para extrair suas especificações
      const itemStartIndex = tableText.indexOf(firstItemCode);
      let itemEndIndex = tableText.length;
      
      // Se houver um segundo item, limitar a extração até ele
      if (itemMatches.length > 1) {
        itemEndIndex = tableText.indexOf(itemMatches[1][1]);
      }
      
      const itemSection = tableText.substring(itemStartIndex, itemEndIndex);
      console.log('Seção do item:', itemSection.substring(0, 300));
      
      // Extrair descrição completa do item incluindo todas as especificações
      const descriptionParts: string[] = [];
      
      // Produto principal (coffee maker, etc.)
      const productMatch = itemSection.match(/coffee\s+maker\s+\d+V/i);
      if (productMatch) {
        descriptionParts.push(productMatch[0]);
      }
      
      // Serial NO. - capturar toda a linha
      const serialMatch = itemSection.match(/Serial\s+NO\.?\s*:?\s*([^\n\r]+)/i);
      if (serialMatch) {
        descriptionParts.push(`Serial NO.: ${serialMatch[1].trim()}`);
      }
      
      // G.W. e N.W. - capturar pesos individuais e totais
      const gwMatches = Array.from(itemSection.matchAll(/(?:G\.W\.|Total\s+G\.W\.)\s*:?\s*([\d.,]+\s*kgs?)/gi));
      gwMatches.forEach(match => {
        descriptionParts.push(`G.W.: ${match[1]}`);
      });
      
      const nwMatches = Array.from(itemSection.matchAll(/(?:N\.W\.|Total\s+N\.W\.)\s*:?\s*([\d.,]+\s*kgs?)/gi));
      nwMatches.forEach(match => {
        descriptionParts.push(`N.W.: ${match[1]}`);
      });
      
      // TOTAL com CTN e CBM
      const totalMatch = itemSection.match(/TOTAL\s*:?\s*([^\n\r]+)/i);
      if (totalMatch) {
        descriptionParts.push(`TOTAL: ${totalMatch[1].trim()}`);
      }
      
      if (descriptionParts.length > 0) {
        result.description = descriptionParts.join(' | ');
        console.log('Descrição extraída:', result.description);
      }
      
      // Extrair quantidade, preço e valor do primeiro item
      // Buscar na linha do primeiro item os valores numéricos
      const firstItemLine = itemSection.split('\n').find(line => 
        line.includes(firstItemCode) || line.match(/\d{1,3}(?:,\d{3})*(?:\.\d{2})?/)
      );
      
      if (firstItemLine) {
        console.log('Linha do primeiro item:', firstItemLine);
        
        // Extrair quantidade (número antes do preço)
        const quantityMatch = firstItemLine.match(/(\d{1,3}(?:,\d{3})*)\s+\$\s*\d/);
        if (quantityMatch) {
          result.quantity = quantityMatch[1];
        }
        
        // Extrair preço unitário
        const priceMatch = firstItemLine.match(/\$\s*(\d+(?:\.\d{2})?)/);
        if (priceMatch) {
          result.unitPrice = `$${priceMatch[1]}`;
        }
        
        // Extrair valor total (último valor monetário da linha)
        const amountMatches = Array.from(firstItemLine.matchAll(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g));
        if (amountMatches.length > 1) {
          // Pegar o último valor (amount total)
          const lastAmount = amountMatches[amountMatches.length - 1];
          result.amount = `$${lastAmount[1]}`;
        }
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
