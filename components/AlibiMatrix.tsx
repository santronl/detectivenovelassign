import React from 'react';
import { Alibi, Character } from '../types';
import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react';

interface Props {
  alibis: Alibi[];
  characters: Character[];
}

const AlibiMatrix: React.FC<Props> = ({ alibis, characters }) => {
  const getCharacterName = (id: string) => characters.find(c => c.id === id)?.name || id;

  const getStatusIcon = (status: Alibi['status']) => {
    switch(status) {
      case '确凿': return <CheckCircle2 size={16} className="text-green-400" />;
      case '模糊': return <HelpCircle size={16} className="text-yellow-400" />;
      case '无证明': return <XCircle size={16} className="text-red-400" />;
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-800/50">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="bg-slate-900 text-slate-200 uppercase font-bold text-xs">
          <tr>
            <th className="px-6 py-3">角色</th>
            <th className="px-6 py-3">时间段</th>
            <th className="px-6 py-3">地点</th>
            <th className="px-6 py-3">状态</th>
            <th className="px-6 py-3">详情</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {alibis.length === 0 ? (
             <tr>
               <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                 尚未录入不在场证明...
               </td>
             </tr>
          ) : (
            alibis.map((alibi, idx) => (
              <tr key={idx} className="hover:bg-slate-700/50 transition-colors">
                <td className="px-6 py-4 font-medium text-white">{getCharacterName(alibi.character_id)}</td>
                <td className="px-6 py-4">{alibi.time_period}</td>
                <td className="px-6 py-4">{alibi.location}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border
                    ${alibi.status === '确凿' ? 'bg-green-900/30 text-green-300 border-green-800' : ''}
                    ${alibi.status === '模糊' ? 'bg-yellow-900/30 text-yellow-300 border-yellow-800' : ''}
                    ${alibi.status === '无证明' ? 'bg-red-900/30 text-red-300 border-red-800' : ''}
                  `}>
                    {getStatusIcon(alibi.status)}
                    {alibi.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-400 max-w-xs truncate">{alibi.details || '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AlibiMatrix;