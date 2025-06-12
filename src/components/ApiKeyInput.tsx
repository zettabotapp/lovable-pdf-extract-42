
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Key, AlertCircle, CheckCircle } from 'lucide-react';

interface ApiKeyInputProps {
  apiKey: string;
  setApiKey: (key: string) => void;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ apiKey, setApiKey }) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const { toast } = useToast();

  const handleSaveApiKey = () => {
    if (!tempApiKey.trim()) {
      toast({
        title: "Chave inválida",
        description: "Por favor, insira uma chave válida da API do ChatGPT.",
        variant: "destructive",
      });
      return;
    }

    setApiKey(tempApiKey.trim());
    toast({
      title: "Chave salva com sucesso!",
      description: "A API do ChatGPT foi configurada e está pronta para uso.",
    });
  };

  const handleClearApiKey = () => {
    setApiKey('');
    setTempApiKey('');
    toast({
      title: "Chave removida",
      description: "A chave da API foi removida do sistema.",
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700">
            <Key size={20} />
            Chave da API do ChatGPT
          </CardTitle>
          <CardDescription>
            Insira sua chave da API do OpenAI para ativar a funcionalidade de extração de dados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">Chave da API</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveApiKey} className="bg-blue-600 hover:bg-blue-700">
              <Key className="mr-2" size={16} />
              Salvar Chave
            </Button>
            {apiKey && (
              <Button onClick={handleClearApiKey} variant="outline">
                Remover Chave
              </Button>
            )}
          </div>

          {apiKey && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-md">
              <CheckCircle size={16} />
              <span className="text-sm font-medium">API configurada e pronta para uso!</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <AlertCircle size={20} />
            Informações Importantes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-orange-800 space-y-2">
            <p><strong>Como obter sua chave da API:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Acesse <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">platform.openai.com/api-keys</a></li>
              <li>Crie uma nova chave de API</li>
              <li>Copie e cole a chave no campo acima</li>
            </ul>
            <p className="mt-3"><strong>Segurança:</strong> Sua chave é armazenada apenas localmente no seu navegador e não é enviada para nossos servidores.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50">
        <CardHeader>
          <CardTitle className="text-purple-700">Prompts Utilizados para Extração</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-purple-800 space-y-2">
            <p><strong>Prompt principal enviado para o ChatGPT:</strong></p>
            <div className="bg-white p-3 rounded border border-purple-200 mt-2">
              <code className="text-xs">
                "Analise o seguinte texto extraído de um PDF e identifique os seguintes campos específicos. 
                Retorne apenas os valores encontrados em formato JSON:
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
                - swift (SWIFT, geralmente ZSRCCNBB)
                
                Se algum campo não for encontrado, deixe como string vazia. Texto do PDF: [TEXTO_EXTRAÍDO]"
              </code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
