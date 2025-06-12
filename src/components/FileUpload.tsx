import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ExtractedData } from '@/types/ExtractedData';
import { extractDataFromPDF } from '@/utils/pdfExtractor';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onDataExtracted: (data: ExtractedData[]) => void;
  apiKey: string;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onDataExtracted,
  apiKey,
  isProcessing,
  setIsProcessing
}) => {
  const { toast } = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!apiKey) {
      toast({
        title: "Chave da API necessária",
        description: "Configure sua chave da API do ChatGPT na aba 'Configuração'",
        variant: "destructive",
      });
      return;
    }

    if (acceptedFiles.length === 0) return;

    setIsProcessing(true);
    const extractedResults: ExtractedData[] = [];

    try {
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        
        toast({
          title: `Processando arquivo ${i + 1} de ${acceptedFiles.length}`,
          description: `Extraindo dados de: ${file.name}`,
        });

        try {
          // extractDataFromPDF agora retorna um array de ExtractedData
          const extractedDataArray = await extractDataFromPDF(file, apiKey);
          extractedResults.push(...extractedDataArray);
        } catch (error) {
          console.error(`Erro ao processar ${file.name}:`, error);
          toast({
            title: `Erro ao processar ${file.name}`,
            description: "O arquivo pode estar corrompido ou não ter dados válidos.",
            variant: "destructive",
          });
        }
      }

      if (extractedResults.length > 0) {
        onDataExtracted(extractedResults);
      }
    } catch (error) {
      console.error('Erro geral no processamento:', error);
      toast({
        title: "Erro no processamento",
        description: "Ocorreu um erro durante o processamento dos arquivos.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [apiKey, onDataExtracted, setIsProcessing, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true,
    disabled: isProcessing
  });

  return (
    <div className="space-y-4">
      <Card
        {...getRootProps()}
        className={`p-8 border-2 border-dashed transition-colors cursor-pointer ${
          isDragActive 
            ? 'border-blue-400 bg-blue-50' 
            : isProcessing 
            ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-center">
          <div className="flex justify-center mb-4">
            {isProcessing ? (
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            ) : (
              <Upload className="h-12 w-12 text-gray-400" />
            )}
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {isProcessing 
              ? 'Processando PDFs...' 
              : isDragActive 
              ? 'Solte os arquivos aqui...' 
              : 'Arraste e solte PDFs aqui'
            }
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {isProcessing 
              ? 'Por favor, aguarde...' 
              : 'ou clique para selecionar arquivos'
            }
          </p>
          {!isProcessing && (
            <Button variant="outline" type="button">
              <FileText className="mr-2 h-4 w-4" />
              Selecionar PDFs
            </Button>
          )}
        </div>
      </Card>

      {!apiKey && (
        <Card className="p-4 border-orange-200 bg-orange-50">
          <div className="flex items-center gap-2 text-orange-800">
            <AlertCircle size={20} />
            <p className="text-sm font-medium">
              Chave da API não configurada. Vá para a aba 'Configuração' para inserir sua chave do ChatGPT.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};
