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
): Promise<ExtractionResult[]> => {
  const prompt = `Analise o seguinte texto extraído de um PDF de uma fatura (Proforma Invoice) e identifique os seguintes campos para TODOS os itens da tabela.

INSTRUÇÕES CRÍTICAS PARA EXTRAÇÃO DE DADOS DA TABELA:
1. O "itemNo" deve ser extraído da PRIMEIRA COLUNA da tabela (Item No.), não da descrição
2. Procure por TODOS os códigos como "72692-01", "72692-02" etc. na primeira coluna
3. A "description" deve incluir apenas o nome do produto (ex: coffee maker 127V, coffee maker 220V)
4. NÃO inclua Serial NO., G.W., N.W., Total G.W., Total N.W. na descrição
5. Extraia TODOS os itens encontrados na tabela, não apenas o primeiro

IMPORTANTE: Extraia TODOS os itens encontrados na tabela. Se houver múltiplos itens (72692-01, 72692-02, etc.), extraia os dados de TODOS eles.

Retorne um array JSON com todos os itens encontrados, sem comentários ou texto adicional:

Campos para extrair para cada item:
- piNo (P/I No.)
- poNo (P/O No.)
- scNo (S/C No.)
- itemNo (código da PRIMEIRA coluna da tabela - ex: 72692-01, 72692-02)
- description (apenas o nome do produto, sem especificações técnicas)
- quantity (quantidade do item)
- unitPrice (preço unitário do item)
- amount (valor total do item)
- beneficiary (BENEFICIARY)
- nameOfBank (NAME OF THE BANK)
- accountNo (ACCOUNT No.)
- swift (SWIFT)

Se algum campo não for encontrado, deixe como string vazia "".

Texto do PDF:
${pdfText}

Responda apenas com o array JSON:`;

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
            content: 'Você é um assistente especializado em extrair dados estruturados de faturas e documentos comerciais. Você deve extrair TODOS os itens da tabela, não apenas o primeiro. Retorne sempre um array JSON válido sem comentários.'
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
      console.log('Dados extraídos via ChatGPT:', parsedResult);
      
      // Garantir que retornamos um array
      if (Array.isArray(parsedResult)) {
        return parsedResult;
      } else {
        // Se retornou um objeto único, colocar em array
        return [parsedResult];
      }
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

// Função de fallback para extração manual com foco em múltiplos itens
const extractDataManually = (text: string): ExtractionResult[] => {
  const results: ExtractionResult[] = [];
  
  console.log('Executando extração manual de dados...');
  
  // Patterns para campos comuns
  const commonPatterns = {
    piNo: /P\/I\s+No\.?\s*:?\s*([^\s\n\r]+)/i,
    poNo: /P\/O\s+No\.?\s*:?\s*([^\s\n\r]+)/i,
    scNo: /S\/C\s+No\.?\s*:?\s*([^\s\n\r]+)/i,
    swift: /SWIFT\s*:?\s*([A-Z0-9]+)/i,
    beneficiary: /BENEFICIARY\s*:?\s*([^\n\r]+)/i,
    nameOfBank: /NAME\s+OF\s+THE\s+BANK\s*:?\s*([^\n\r]+)/i,
    accountNo: /ACCOUNT\s+No\.?\s*:?\s*([^\s\n\r]+)/i,
  };

  // Extrair dados comuns
  const commonData: Partial<ExtractionResult> = {};
  for (const [key, pattern] of Object.entries(commonPatterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      commonData[key as keyof ExtractionResult] = match[1].trim();
    }
  }

  // Extrair dados da tabela de itens
  const tableMatch = text.match(/Item\s+No\.[\s\S]*?Commodity\s+&\s+Specifications[\s\S]*?(?=REMARKS|BENEFICIARY|\$.*DOLLARS|$)/i);
  
  if (tableMatch) {
    const tableText = tableMatch[0];
    console.log('Texto da tabela encontrado:', tableText.substring(0, 500));
    
    // Buscar TODOS os códigos de item na primeira coluna (formato XXXXX-XX)
    const itemCodePattern = /(\d{5}-\d{2})/g;
    const itemMatches = Array.from(tableText.matchAll(itemCodePattern));
    
    console.log('Códigos de item encontrados:', itemMatches.map(m => m[1]));
    
    if (itemMatches.length > 0) {
      // Processar cada item encontrado
      itemMatches.forEach((itemMatch, index) => {
        const itemCode = itemMatch[1];
        
        // Encontrar a linha que contém este item específico
        const lines = tableText.split('\n');
        const itemLine = lines.find(line => line.includes(itemCode));
        
        if (itemLine) {
          console.log(`Processando item ${itemCode}:`, itemLine);
          
          const itemResult: ExtractionResult = {
            ...commonData,
            itemNo: itemCode
          };
          
          // Extrair descrição básica (coffee maker)
          const productMatch = itemLine.match(/coffee\s+maker\s+\d+V/i);
          if (productMatch) {
            itemResult.description = productMatch[0];
          }
          
          // Extrair valores numéricos da linha do item
          const numbers = itemLine.match(/\d{1,3}(?:,\d{3})*/g);
          const prices = itemLine.match(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
          
          if (numbers && numbers.length > 0) {
            // Primeira ocorrência geralmente é a quantidade
            itemResult.quantity = numbers[0];
          }
          
          if (prices && prices.length > 0) {
            // Primeiro preço é unitário
            itemResult.unitPrice = prices[0];
            
            // Se houver dois preços, o segundo é o total
            if (prices.length > 1) {
              itemResult.amount = prices[1];
            }
          }
          
          results.push(itemResult);
        }
      });
    }
  }

  console.log('Resultado da extração manual:', results);
  return results.length > 0 ? results : [commonData as ExtractionResult];
};

export const extractDataFromPDF = async (
  file: File,
  apiKey: string
): Promise<ExtractedData[]> => {
  console.log(`Iniciando extração de dados do arquivo: ${file.name}`);
  
  try {
    // Extrair texto do PDF
    const pdfText = await extractTextFromPDF(file);
    console.log('Texto extraído do PDF:', pdfText.substring(0, 500) + '...');
    
    // Extrair dados usando ChatGPT - agora retorna array
    const extractedFieldsArray = await extractDataWithChatGPT(pdfText, apiKey);
    console.log('Campos extraídos:', extractedFieldsArray);

    // Montar o array de objetos finais
    const extractedDataArray: ExtractedData[] = extractedFieldsArray.map((extractedFields, index) => ({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9) + '_' + index,
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
    }));

    return extractedDataArray;
  } catch (error) {
    console.error('Erro na extração de dados:', error);
    throw error;
  }
};
