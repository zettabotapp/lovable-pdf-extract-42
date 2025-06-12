import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUpload } from '@/components/FileUpload';
import { DataTable } from '@/components/DataTable';
import { ApiKeyInput } from '@/components/ApiKeyInput';
import { ExtractedData } from '@/types/ExtractedData';
import { exportToExcel } from '@/utils/excelExporter';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, Key } from 'lucide-react';

const Index = () => {
  const [extractedData, setExtractedData] = useState<ExtractedData[]>([]);
  const [apiKey, setApiKey] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleDataExtracted = (newData: ExtractedData[]) => {
    setExtractedData(prev => [...prev, ...newData]);
    toast({
      title: "Dados extraídos com sucesso!",
      description: `${newData.length} PDF(s) processado(s)`,
    });
  };

  const handleExportToExcel = () => {
    if (extractedData.length === 0) {
      toast({
        title: "Nenhum dado para exportar",
        description: "Faça o upload e processamento de PDFs primeiro.",
        variant: "destructive",
      });
      return;
    }

    try {
      exportToExcel(extractedData);
      toast({
        title: "Exportação realizada!",
        description: "Os dados foram exportados para Excel com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro na exportação",
        description: "Ocorreu um erro ao exportar os dados.",
        variant: "destructive",
      });
    }
  };

  const handleClearData = () => {
    setExtractedData([]);
    toast({
      title: "Dados limpos",
      description: "Todos os dados foram removidos da tabela.",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-[115rem] mx-auto">
        <div className="text-center mb-8">
          <h4 className="text-4xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-3">
            <FileText className="text-blue-600" size={40} />
            Extração de Dados PDF - Proforma Invoice
          </h4>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Faça o upload de 1 ou mais PDF's para extração automática de dados pelo ChatGPT
          </p>
        </div>

        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload & Processamento</TabsTrigger>
            <TabsTrigger value="data">Dados Extraídos</TabsTrigger>
            <TabsTrigger value="config">Configuração</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="text-blue-600" size={24} />
                  Upload de PDFs
                </CardTitle>
                <CardDescription>
                  Faça o upload de um ou mais arquivos PDF para extração automática de dados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUpload
                  onDataExtracted={handleDataExtracted}
                  apiKey={apiKey}
                  isProcessing={isProcessing}
                  setIsProcessing={setIsProcessing}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="text-green-600" size={24} />
                    Dados Extraídos ({extractedData.length} registros)
                  </CardTitle>
                  <CardDescription>
                    Visualize e exporte os dados extraídos dos PDFs
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleClearData}
                    variant="outline"
                    disabled={extractedData.length === 0}
                  >
                    Limpar Dados
                  </Button>
                  <Button 
                    onClick={handleExportToExcel}
                    disabled={extractedData.length === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Download className="mr-2" size={16} />
                    Exportar para Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <DataTable data={extractedData} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="text-purple-600" size={24} />
                  Configuração da API
                </CardTitle>
                <CardDescription>
                  Configure sua chave da API do ChatGPT para ativar a funcionalidade de extração
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApiKeyInput apiKey={apiKey} setApiKey={setApiKey} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
