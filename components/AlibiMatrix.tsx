
import React, { useState } from 'react';
import { Alibi, Character } from '../types';
import { CheckCircle2, HelpCircle, XCircle, Plus, Trash2, Edit3, X, Users, Clock, MapPin, AlignLeft, ShieldCheck, Check } from 'lucide-react';

interface Props {
  alibis: Alibi[];
  characters: Character[];
  onAddAlibi: (alibi: Alibi) => void;
  onUpdateAlibi: (alibi: Alibi, index: number) => void;
  onDeleteAlibi: (index: number) => void;
}

const AlibiMatrix: React.FC<Props> = ({ alibis, characters, onAddAlibi, onUpdateAlibi, onDeleteAlibi }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // Form State
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [timePeriod, setTimePeriod] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<Alibi['status']>('模糊');
  const [details, setDetails] = useState('');

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setSelectedCharIds([]);
    setTimePeriod('');
    setLocation('');
    setStatus('模糊');
    setDetails('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (alibi: Alibi, index: number) => {
    setEditingIndex(index);
    setSelectedCharIds(alibi.character_ids || []);
    setTimePeriod(alibi.time_period);
    setLocation(alibi.location);
    setStatus(alibi.status);
    setDetails(alibi.details || '');
    setIsModalOpen(true);
  };

  const toggleCharacter = (id: string) => {
    setSelectedCharIds(prev => 
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (selectedCharIds.length === 0 || !timePeriod || !location) return;

    const alibiData: Alibi = {
      character_ids: selectedCharIds,
      time_period: timePeriod,
      location,
      status,
      details
    };

    if (editingIndex !== null) {
      onUpdateAlibi(alibiData, editingIndex);
    } else {
      onAddAlibi(alibiData);
    }
    setIsModalOpen(false);
  };

  const getCharacterNames = (ids: string[]) => {
    if (!ids || ids.length === 0) return "未知角色";
    return ids.map(id => characters.find(c => c.id === id)?.name || "未知").join(', ');
  };

  const getStatusIcon = (status: Alibi['status']) => {
    switch(status) {
      case '确凿': return <CheckCircle2 size={16} className="text-green-400" />;
      case '模糊': return <HelpCircle size={16} className="text-yellow-400" />;
      case '无证明': return <XCircle size={16} className="text-red-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">不在场证明矩阵 • 核实嫌疑人动向</p>
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-purple-900/30 transition-all active:scale-95"
        >
          <Plus size={18} /> 录入不在场证明
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-800/40 shadow-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[11px] tracking-wider">
            <tr>
              <th className="px-6 py-4">角色成员</th>
              <th className="px-6 py-4">时间段</th>
              <th className="px-6 py-4">地点</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4">详情备注</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {alibis.length === 0 ? (
               <tr>
                 <td colSpan={6} className="px-6 py-20 text-center text-slate-600 italic">
                   <div className="flex flex-col items-center gap-3">
                     <ShieldCheck size={40} strokeWidth={1} />
                     <p>尚未录入不在场证明数据...</p>
                   </div>
                 </td>
               </tr>
            ) : (
              alibis.map((alibi, idx) => (
                <tr key={idx} className="hover:bg-slate-700/30 transition-colors group">
                  <td className="px-6 py-4 font-bold text-blue-300 max-w-xs">
                    <div className="flex flex-wrap gap-1">
                      {(alibi.character_ids || []).map(cid => {
                        const name = characters.find(c => c.id === cid)?.name || "未知";
                        return (
                          <span key={cid} className="bg-blue-900/40 text-blue-200 px-2 py-0.5 rounded border border-blue-700/50 text-[10px] whitespace-nowrap">
                            {name}
                          </span>
                        );
                      })}
                      {(!alibi.character_ids || alibi.character_ids.length === 0) && "未知角色"}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-400">{alibi.time_period}</td>
                  <td className="px-6 py-4">{alibi.location}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm
                      ${alibi.status === '确凿' ? 'bg-green-900/30 text-green-300 border-green-800/50' : ''}
                      ${alibi.status === '模糊' ? 'bg-yellow-900/30 text-yellow-300 border-yellow-800/50' : ''}
                      ${alibi.status === '无证明' ? 'bg-red-900/30 text-red-300 border-red-800/50' : ''}
                    `}>
                      {getStatusIcon(alibi.status)}
                      {alibi.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 max-w-xs">
                    <p className="truncate" title={alibi.details}>{alibi.details || '-'}</p>
                  </td>
                  <td className="px-6 py-4 text-right space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleOpenEdit(alibi, idx)}
                      className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-all"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button 
                      onClick={() => onDeleteAlibi(idx)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Alibi Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-3">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <ShieldCheck size={20} className="text-white" />
                </div>
                {editingIndex !== null ? '编辑证明记录' : '录入证明记录'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
            </div>
            
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
                  <span className="flex items-center gap-2"><Users size={14} /> 涉及角色 <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">已选 {selectedCharIds.length} 位</span>
                </label>
                <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                   <div className="max-h-32 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                     {characters.map(c => (
                       <button
                         key={c.id}
                         onClick={() => toggleCharacter(c.id)}
                         className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                           selectedCharIds.includes(c.id) 
                           ? 'bg-purple-900/30 text-purple-200 border border-purple-500/30' 
                           : 'text-slate-400 hover:bg-slate-800 border border-transparent'
                         }`}
                       >
                         <span className="truncate">{c.name}</span>
                         {selectedCharIds.includes(c.id) && <Check size={14} className="text-purple-400" />}
                       </button>
                     ))}
                     {characters.length === 0 && (
                       <div className="p-4 text-center text-xs text-slate-600 italic">请先在侧边栏添加人物</div>
                     )}
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Clock size={14} /> 时间段 <span className="text-red-500">*</span>
                  </label>
                  <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                    value={timePeriod}
                    onChange={(e) => setTimePeriod(e.target.value)}
                    placeholder="如: 20:00 - 21:30"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <MapPin size={14} /> 所在地点 <span className="text-red-500">*</span>
                  </label>
                  <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="如: 宴会大厅"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <ShieldCheck size={14} /> 状态验证
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['确凿', '模糊', '无证明'] as Alibi['status'][]).map(s => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        status === s 
                        ? 'bg-purple-600 border-purple-400 text-white shadow-lg' 
                        : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <AlignLeft size={14} /> 证言详情与证人
                </label>
                <textarea 
                  className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none transition-all"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="记录该人当时的具体活动，以及是否有其他人可以作证..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/20">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSubmit}
                disabled={selectedCharIds.length === 0 || !timePeriod || !location}
                className="px-8 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/20 transition-all active:scale-95"
              >
                {editingIndex !== null ? '保存修改' : '确认录入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlibiMatrix;
