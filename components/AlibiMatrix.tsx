
import React, { useState } from 'react';
import { Alibi, Character, TimePoint } from '../types';
import { CheckCircle2, HelpCircle, XCircle, Plus, Trash2, Edit3, X, Users, Clock, MapPin, AlignLeft, ShieldCheck, Check, Calendar } from 'lucide-react';

interface Props {
  alibis: Alibi[];
  characters: Character[];
  timePoints: TimePoint[]; // 新增：时间点列表
  onAddAlibi: (alibi: Alibi) => void;
  onUpdateAlibi: (alibi: Alibi, index: number) => void;
  onDeleteAlibi: (index: number) => void;
}

const AlibiMatrix: React.FC<Props> = ({ alibis, characters, timePoints, onAddAlibi, onUpdateAlibi, onDeleteAlibi }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // Form State
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [timePeriod, setTimePeriod] = useState('');
  const [selectedTimePointId, setSelectedTimePointId] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<Alibi['status']>('模糊');
  const [details, setDetails] = useState('');

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setSelectedCharIds([]);
    setTimePeriod('');
    setSelectedTimePointId(undefined);
    setLocation('');
    setStatus('模糊');
    setDetails('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (alibi: Alibi, index: number) => {
    setEditingIndex(index);
    setSelectedCharIds(alibi.character_ids || []);
    setTimePeriod(alibi.time_period);
    setSelectedTimePointId(alibi.timePointId);
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
      timePointId: selectedTimePointId,
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
              <th className="px-6 py-4">时间段 / 时间点</th>
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
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-xs">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-slate-300">{alibi.time_period}</span>
                      {alibi.timePointId && (
                        <div className="flex items-center gap-1.5 text-[10px] text-purple-400 font-bold bg-purple-900/20 px-1.5 py-0.5 rounded border border-purple-500/20 w-fit">
                          <Clock size={10} />
                          关联点: {timePoints.find(t => t.id === alibi.timePointId)?.label || '已移除'}
                        </div>
                      )}
                    </div>
                  </td>
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-3">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <ShieldCheck size={20} className="text-white" />
                </div>
                {editingIndex !== null ? '编辑证明记录' : '录入证明记录'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
                  <span className="flex items-center gap-2"><Users size={14} /> 涉及角色 <span className="text-red-500">*</span></span>
                </label>
                <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden p-2 grid grid-cols-2 gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                  {characters.map(c => (
                    <button
                      key={c.id}
                      onClick={() => toggleCharacter(c.id)}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all ${
                        selectedCharIds.includes(c.id) 
                        ? 'bg-purple-900/30 text-purple-200 border border-purple-500/30' 
                        : 'text-slate-500 hover:bg-slate-800 border border-transparent'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {selectedCharIds.includes(c.id) && <Check size={12} className="text-purple-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Clock size={14} /> 关联空间轨迹时间点
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {timePoints.map(tp => (
                      <button
                        key={tp.id}
                        onClick={() => {
                          setSelectedTimePointId(tp.id === selectedTimePointId ? undefined : tp.id);
                          // 自动同步标签
                          if (tp.id !== selectedTimePointId && !timePeriod) setTimePeriod(tp.label);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          selectedTimePointId === tp.id
                          ? 'bg-purple-600 border-purple-400 text-white shadow-lg'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                        }`}
                      >
                        {tp.label}
                      </button>
                    ))}
                    {timePoints.length === 0 && <span className="text-xs text-slate-600 italic">暂无轨迹点，请在空间轨迹标签页添加</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Calendar size={14} /> 自定义时间段 <span className="text-red-500">*</span>
                    </label>
                    <input 
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-xs focus:ring-2 focus:ring-purple-500 outline-none transition-all"
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
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-xs focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="如: 宴会大厅"
                    />
                  </div>
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
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
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
                  <AlignLeft size={14} /> 证言详情
                </label>
                <textarea 
                  className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none transition-all"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="详细描述活动与人证..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/20">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-medium">取消</button>
              <button 
                onClick={handleSubmit}
                disabled={selectedCharIds.length === 0 || !timePeriod || !location}
                className="px-8 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-sm font-bold shadow-lg"
              >
                确认录入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlibiMatrix;
