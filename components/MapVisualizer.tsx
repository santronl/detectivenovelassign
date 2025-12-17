import React from 'react';
import { Space } from '../types';
import { Lock, DoorOpen, EyeOff, MapPin } from 'lucide-react';

interface Props {
  spaces: Space[];
}

const MapVisualizer: React.FC<Props> = ({ spaces }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {spaces.map(space => (
        <div key={space.id} className="bg-slate-800 border border-slate-700 p-4 rounded-lg shadow-md hover:border-blue-500/50 transition-all group">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <MapPin size={18} className="text-blue-400" />
              {space.name}
            </h3>
            <div className="flex gap-1">
              {space.attributes.includes('上锁') && (
                <div title="上锁">
                  <Lock size={14} className="text-red-400" />
                </div>
              )}
              {space.attributes.includes('密室') && <div className="text-[10px] bg-purple-900 text-purple-200 px-1 rounded border border-purple-700">密室</div>}
              {space.attributes.includes('未探索') && (
                <div title="未探索">
                  <EyeOff size={14} className="text-slate-500" />
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-4">
            <h4 className="text-xs uppercase text-slate-500 font-bold mb-2">连通区域</h4>
            <div className="flex flex-wrap gap-2">
              {space.connected_to.length > 0 ? (
                space.connected_to.map((conn, i) => (
                  <span key={i} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded flex items-center gap-1">
                    <DoorOpen size={10} />
                    {conn}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-600">孤立区域</span>
              )}
            </div>
          </div>
        </div>
      ))}
      {spaces.length === 0 && (
         <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-700 rounded-lg text-slate-500">
           暂无地图数据，请通过输入导入场景描述...
         </div>
      )}
    </div>
  );
};

export default MapVisualizer;