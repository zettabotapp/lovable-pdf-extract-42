
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExtractedData } from '@/types/ExtractedData';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DataTableProps {
  data: ExtractedData[];
}

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium mb-2">Nenhum dado extraído ainda</p>
          <p className="text-sm">Faça o upload de PDFs na aba 'Upload & Processamento' para ver os dados aqui.</p>
        </div>
      </Card>
    );
  }

  const formatCellValue = (value: string) => {
    return value || '-';
  };

  const getCellClassName = (value: string) => {
    return value ? 'text-gray-900' : 'text-gray-400 italic';
  };

  return (
    <Card>
      <ScrollArea className="h-[600px] w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">Arquivo</TableHead>
              <TableHead className="font-semibold">P/I No.</TableHead>
              <TableHead className="font-semibold">P/O No.</TableHead>
              <TableHead className="font-semibold">S/C No.</TableHead>
              <TableHead className="font-semibold">Item No.</TableHead>
              <TableHead className="font-semibold">Description</TableHead>
              <TableHead className="font-semibold">Quantity</TableHead>
              <TableHead className="font-semibold">Unit Price</TableHead>
              <TableHead className="font-semibold">Amount</TableHead>
              <TableHead className="font-semibold">Beneficiary</TableHead>
              <TableHead className="font-semibold">Bank Name</TableHead>
              <TableHead className="font-semibold">Account No.</TableHead>
              <TableHead className="font-semibold">SWIFT</TableHead>
              <TableHead className="font-semibold">Extraído em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id} className="hover:bg-gray-50">
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <span className="text-sm text-blue-600 truncate max-w-[150px]" title={row.fileName}>
                      {row.fileName}
                    </span>
                    <Badge variant="secondary" className="text-xs w-fit mt-1">
                      {new Date(row.extractedAt).toLocaleDateString('pt-BR')}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className={getCellClassName(row.piNo)}>
                  {formatCellValue(row.piNo)}
                </TableCell>
                <TableCell className={getCellClassName(row.poNo)}>
                  {formatCellValue(row.poNo)}
                </TableCell>
                <TableCell className={getCellClassName(row.scNo)}>
                  {formatCellValue(row.scNo)}
                </TableCell>
                <TableCell className={getCellClassName(row.itemNo)}>
                  {formatCellValue(row.itemNo)}
                </TableCell>
                <TableCell className={getCellClassName(row.description)}>
                  <div className="max-w-[200px] truncate" title={row.description}>
                    {formatCellValue(row.description)}
                  </div>
                </TableCell>
                <TableCell className={getCellClassName(row.quantity)}>
                  {formatCellValue(row.quantity)}
                </TableCell>
                <TableCell className={getCellClassName(row.unitPrice)}>
                  {formatCellValue(row.unitPrice)}
                </TableCell>
                <TableCell className={getCellClassName(row.amount)}>
                  {formatCellValue(row.amount)}
                </TableCell>
                <TableCell className={getCellClassName(row.beneficiary)}>
                  <div className="max-w-[150px] truncate" title={row.beneficiary}>
                    {formatCellValue(row.beneficiary)}
                  </div>
                </TableCell>
                <TableCell className={getCellClassName(row.nameOfBank)}>
                  <div className="max-w-[150px] truncate" title={row.nameOfBank}>
                    {formatCellValue(row.nameOfBank)}
                  </div>
                </TableCell>
                <TableCell className={getCellClassName(row.accountNo)}>
                  {formatCellValue(row.accountNo)}
                </TableCell>
                <TableCell className={getCellClassName(row.swift)}>
                  {formatCellValue(row.swift)}
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  {new Date(row.extractedAt).toLocaleString('pt-BR')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </Card>
  );
};
