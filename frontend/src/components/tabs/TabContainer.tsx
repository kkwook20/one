import React from 'react';
import { Film, Palette, Clapperboard } from 'lucide-react';

interface TabContainerProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

// The One 로고 컴포넌트 - 더 미니멀하게
const TheOneLogo = () => (
  <div className="p-6 bg-gradient-to-b from-gray-950 to-gray-900">
    <div className="flex items-center gap-3">
      {/* 심플한 로고 */}
      <div className="relative">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl">
          <div className="w-6 h-6 rounded-md bg-white/20 backdrop-blur" />
        </div>
        <div className="absolute -inset-1 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl blur opacity-30" />
      </div>
      
      {/* 텍스트 */}
      <div>
        <h1 className="text-xl font-bold text-white">The One</h1>
        <p className="text-xs text-gray-500">AI Workflow Engine</p>
      </div>
    </div>
  </div>
);

const TabContainer: React.FC<TabContainerProps> = ({ activeTab, setActiveTab }) => {
  const categories = [
    {
      id: 'preproduction',
      name: 'Pre-Production',
      icon: <Palette className="w-4 h-4" />,
      tabs: [
        { id: 'story', name: 'Story' },
        { id: 'layout', name: 'Layout' },
        { id: 'artwork', name: 'Artwork' },
        { id: 'concept', name: 'Concept' }
      ]
    },
    {
      id: 'postproduction',
      name: 'Post-Production',
      icon: <Film className="w-4 h-4" />,
      tabs: [
        { id: 'modeling', name: 'Modeling' },
        { id: 'animation', name: 'Animation' },
        { id: 'texture', name: 'Texture' },
        { id: 'lighting', name: 'Lighting' },
        { id: 'vfx', name: 'VFX' },
        { id: 'composition', name: 'Composition' },
        { id: 'rigging', name: 'Rigging' },
        { id: 'editing', name: 'Editing' }
      ]
    },
    {
      id: 'director',
      name: 'Director',
      icon: <Clapperboard className="w-4 h-4" />,
      tabs: [
        { id: 'direction', name: 'Direction' },
        { id: 'feedback', name: 'Feedback' },
        { id: 'reference', name: 'Reference' }
      ]
    }
  ];

  return (
    <div className="w-64 bg-gray-950 border-r border-gray-800/50 flex flex-col h-full">
      {/* The One 로고 */}
      <TheOneLogo />
      
      {/* 탭 카테고리 */}
      <div className="flex-1 overflow-y-auto py-2">
        {categories.map((category, categoryIndex) => (
          <div key={category.id} className="mb-6">
            <div className="px-6 py-2 flex items-center gap-2 text-gray-500">
              <div className="p-1.5 rounded-lg bg-gray-800/50">
                {category.icon}
              </div>
              <span className="text-xs font-medium uppercase tracking-wider">
                {category.name}
              </span>
            </div>
            
            <div className="mt-1">
              {category.tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full px-6 py-2 text-left transition-all duration-200 text-sm ${
                    activeTab === tab.id 
                      ? 'bg-gradient-to-r from-gray-800/50 to-gray-800/30 text-white border-l-2 border-blue-500' 
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* 하단 정보 */}
      <div className="p-4 border-t border-gray-800/50">
        <div className="text-xs text-gray-600 text-center">
          v1.0.0
        </div>
      </div>
    </div>
  );
};

export default TabContainer;