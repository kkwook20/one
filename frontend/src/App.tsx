// frontend/src/App.tsx - 심플한 메인 탭 네비게이션
import React, { useState, lazy, Suspense } from 'react';
import { Brain, Network, Database } from 'lucide-react';

// Lazy load components
const TheOne = lazy(() => import('./components/TheOne/TheOnePipeline'));
const ArgosaSystem = lazy(() => import('./components/Argosa/ArgosaSystem'));
const NeuroNetSystem = lazy(() => import('./components/NeuroNet/NeuroNetSystem'));

// Tab configuration
const TABS = [
  {
    id: 'oneai',
    label: 'One AI',
    icon: Brain,
    component: TheOne,
    description: '3D Animation Automation Pipeline'
  },
  {
    id: 'argosa',
    label: 'Argosa',
    icon: Network,
    component: ArgosaSystem,
    description: 'Information Analysis & Prediction System'
  },
  {
    id: 'neuronet',
    label: 'NeuroNet',
    icon: Database,
    component: NeuroNetSystem,
    description: 'AI Training Data Automation'
  }
] as const;

type TabId = typeof TABS[number]['id'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('oneai');
  
  const ActiveComponent = TABS.find(tab => tab.id === activeTab)?.component || TheOne;
  
  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header with Tabs */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            3D Animation Automation System
          </h1>
          
          {/* Tab Navigation */}
          <nav className="flex space-x-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-6 py-3 rounded-t-lg transition-all
                    ${isActive 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        
        {/* Tab Description */}
        <div className="px-6 pb-3">
          <p className="text-sm text-gray-600">
            {TABS.find(tab => tab.id === activeTab)?.description}
          </p>
        </div>
      </header>
      
      {/* Tab Content */}
      <main className="flex-1 overflow-hidden">
        <Suspense 
          fallback={
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-600">Loading {activeTab} system...</p>
              </div>
            </div>
          }
        >
          <ActiveComponent />
        </Suspense>
      </main>
    </div>
  );
}