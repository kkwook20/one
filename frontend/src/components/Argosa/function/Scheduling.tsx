// frontend/src/components/Argosa/function/Scheduling.tsx

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Calendar,
  Clock,
  Users,
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Plus,
  Edit,
  Trash,
  ChevronRight,
  ChevronDown,
  BarChart3,
  User,
  Bot,
  Sparkles,
  GitBranch,
  Code2,
  Brain,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Types
interface Task {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  assignee: string;
  dependencies: string[];
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed' | 'delayed';
  description?: string;
  subtasks?: Task[];
}

interface Schedule {
  id: string;
  name: string;
  type: 'argosa' | 'oneai' | 'neuronet' | 'service' | 'user';
  tasks: Task[];
  color: string;
  icon: React.ReactNode;
}

interface TimeRange {
  start: Date;
  end: Date;
  label: string;
}

const Scheduling: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [timeView, setTimeView] = useState<'day' | 'week' | 'month' | 'quarter'>('week');
  const [timeRange, setTimeRange] = useState<TimeRange>({ 
    start: new Date(), 
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    label: 'Current Month'
  });
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [termView, setTermView] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  
  // Date formatting helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Load schedules from backend
  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      const response = await fetch('/api/argosa/schedules');
      if (response.ok) {
        const data = await response.json();
        setSchedules(data);
      }
    } catch (error) {
      console.error('Failed to load schedules:', error);
      // Use mock data for development
      setSchedules(mockSchedules);
    }
  };

  // Calculate task position and width based on timeRange
  const getTaskPosition = (task: Task) => {
    const rangeStart = timeRange.start.getTime();
    const rangeEnd = timeRange.end.getTime();
    const taskStart = new Date(task.startDate).getTime();
    const taskEnd = new Date(task.endDate).getTime();
    
    const totalDuration = rangeEnd - rangeStart;
    const left = ((taskStart - rangeStart) / totalDuration) * 100;
    const width = ((taskEnd - taskStart) / totalDuration) * 100;
    
    return { left: `${Math.max(0, left)}%`, width: `${Math.min(100 - left, width)}%` };
  };

  // Generate time grid based on view
  const getTimeGrid = () => {
    const grid = [];
    const start = new Date(timeRange.start);
    const end = new Date(timeRange.end);
    const current = new Date(start);
    
    while (current <= end) {
      switch (timeView) {
        case 'day':
          grid.push(new Date(current));
          current.setDate(current.getDate() + 1);
          break;
        case 'week':
          grid.push(new Date(current));
          current.setDate(current.getDate() + 7);
          break;
        case 'month':
          grid.push(new Date(current));
          current.setMonth(current.getMonth() + 1);
          break;
        case 'quarter':
          grid.push(new Date(current));
          current.setMonth(current.getMonth() + 3);
          break;
      }
    }
    
    return grid;
  };

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const getTasksByTerm = (tasks: Task[]) => {
    const now = new Date();
    const shortTerm = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week
    const mediumTerm = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 1 month
    
    return tasks.filter(task => {
      const taskEnd = new Date(task.endDate);
      switch (termView) {
        case 'short':
          return taskEnd <= shortTerm;
        case 'medium':
          return taskEnd > shortTerm && taskEnd <= mediumTerm;
        case 'long':
          return taskEnd > mediumTerm;
        case 'all':
        default:
          return true;
      }
    });
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'low': return 'bg-gray-400';
      case 'medium': return 'bg-yellow-400';
      case 'high': return 'bg-red-400';
    }
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending': return <Clock className="w-3 h-3" />;
      case 'in-progress': return <TrendingUp className="w-3 h-3" />;
      case 'completed': return <CheckCircle2 className="w-3 h-3" />;
      case 'delayed': return <AlertCircle className="w-3 h-3" />;
    }
  };

  const renderTask = (task: Task, depth: number = 0) => {
    const position = getTaskPosition(task);
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    const isExpanded = expandedTasks.has(task.id);
    
    return (
      <div key={task.id} className="relative">
        <div 
          className="relative h-10 mb-1 flex items-center group"
          style={{ paddingLeft: `${depth * 20}px` }}
        >
          {hasSubtasks && (
            <button
              onClick={() => toggleTaskExpansion(task.id)}
              className="absolute left-0 p-1 hover:bg-gray-200 rounded"
              style={{ left: `${depth * 20 - 20}px` }}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
          
          <div className="absolute inset-0 flex items-center">
            <div className="w-32 pr-2 text-sm truncate">{task.name}</div>
            <div className="flex-1 relative h-8">
              <motion.div
                className={`absolute h-full rounded cursor-pointer flex items-center px-2 ${getPriorityColor(task.priority)}`}
                style={position}
                whileHover={{ scale: 1.02 }}
                onClick={() => setSelectedTask(task)}
              >
                <div className="flex items-center gap-1 text-xs text-white">
                  {getStatusIcon(task.status)}
                  <span>{task.progress}%</span>
                </div>
                <div 
                  className="absolute bottom-0 left-0 h-1 bg-green-600 rounded-b"
                  style={{ width: `${task.progress}%` }}
                />
              </motion.div>
            </div>
          </div>
        </div>
        
        {hasSubtasks && isExpanded && (
          <div className="pl-5">
            {task.subtasks!.map(subtask => renderTask(subtask, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const timeGrid = getTimeGrid();

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Intelligent Scheduling - Gantt Chart
          </h2>
          <p className="text-muted-foreground">
            Manage schedules across all systems and team members
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={termView} onValueChange={(value: any) => setTermView(value)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Terms</SelectItem>
              <SelectItem value="short">Short Term (1 week)</SelectItem>
              <SelectItem value="medium">Medium Term (1 month)</SelectItem>
              <SelectItem value="long">Long Term (1+ month)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={timeView} onValueChange={(value: any) => setTimeView(value)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily View</SelectItem>
              <SelectItem value="week">Weekly View</SelectItem>
              <SelectItem value="month">Monthly View</SelectItem>
              <SelectItem value="quarter">Quarterly View</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setIsCreatingTask(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6">
        {/* Schedule List */}
        <Card className="w-64 flex-shrink-0">
          <CardHeader>
            <CardTitle className="text-lg">Schedules</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="p-4 space-y-2">
                {schedules.map((schedule) => (
                  <button
                    key={schedule.id}
                    onClick={() => setSelectedSchedule(
                      selectedSchedule === schedule.id ? null : schedule.id
                    )}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedSchedule === schedule.id 
                        ? 'bg-primary/10 border-primary' 
                        : 'hover:bg-gray-100'
                    } border`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded ${schedule.color} text-white`}>
                        {schedule.icon}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{schedule.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {schedule.tasks.length} tasks
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Gantt Chart */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-lg">Timeline</CardTitle>
            <CardDescription>
              {timeRange.label} - {formatDate(timeRange.start.toISOString())} to {formatDate(timeRange.end.toISOString())}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Time Grid Header */}
              <div className="flex border-b pb-2 mb-4">
                <div className="w-32"></div>
                <div className="flex-1 flex">
                  {timeGrid.map((date, idx) => (
                    <div 
                      key={idx} 
                      className="flex-1 text-xs text-center text-muted-foreground"
                    >
                      {timeView === 'day' && date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                      {timeView === 'week' && `Week ${Math.ceil(date.getDate() / 7)}`}
                      {timeView === 'month' && date.toLocaleDateString('en-US', { month: 'short' })}
                      {timeView === 'quarter' && `Q${Math.floor(date.getMonth() / 3) + 1}`}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tasks */}
              <ScrollArea className="h-[calc(100vh-400px)]">
                <div className="pr-4">
                  {selectedSchedule ? (
                    <div>
                      {schedules
                        .filter(s => s.id === selectedSchedule)
                        .map(schedule => (
                          <div key={schedule.id}>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                              {schedule.icon}
                              {schedule.name}
                            </h4>
                            {getTasksByTerm(schedule.tasks).map(task => renderTask(task))}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div>
                      {schedules.map(schedule => (
                        <div key={schedule.id} className="mb-6">
                          <h4 className="font-medium mb-3 flex items-center gap-2">
                            {schedule.icon}
                            {schedule.name}
                          </h4>
                          {getTasksByTerm(schedule.tasks).map(task => renderTask(task))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {schedules.reduce((acc, s) => acc + s.tasks.length, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {schedules.reduce((acc, s) => 
                acc + s.tasks.filter(t => t.status === 'in-progress').length, 0
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {schedules.reduce((acc, s) => 
                acc + s.tasks.filter(t => t.status === 'completed').length, 0
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Delayed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {schedules.reduce((acc, s) => 
                acc + s.tasks.filter(t => t.status === 'delayed').length, 0
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedTask?.name}</DialogTitle>
            <DialogDescription>
              Task details and progress tracking
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedTask.startDate)}
                  </p>
                </div>
                <div>
                  <Label>End Date</Label>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedTask.endDate)}
                  </p>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <p className="text-sm text-muted-foreground">
                  {selectedTask.description || 'No description provided'}
                </p>
              </div>
              <div>
                <Label>Progress: {selectedTask.progress}%</Label>
                <Slider
                  value={[selectedTask.progress]}
                  max={100}
                  step={5}
                  className="mt-2"
                  onValueChange={(value) => {
                    // Update progress
                    setSelectedTask({ ...selectedTask, progress: value[0] });
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <Badge variant={
                  selectedTask.priority === 'high' ? 'destructive' :
                  selectedTask.priority === 'medium' ? 'default' :
                  'secondary'
                }>
                  {selectedTask.priority} priority
                </Badge>
                <Badge variant={
                  selectedTask.status === 'completed' ? 'default' :
                  selectedTask.status === 'in-progress' ? 'secondary' :
                  selectedTask.status === 'delayed' ? 'destructive' :
                  'outline'
                }>
                  {selectedTask.status}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Mock data for development
const mockSchedules: Schedule[] = [
  {
    id: 'argosa',
    name: 'Argosa System',
    type: 'argosa',
    color: 'bg-blue-500',
    icon: <Brain className="w-4 h-4" />,
    tasks: [
      {
        id: 't1',
        name: 'LangGraph Integration',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        progress: 65,
        assignee: 'AI Team',
        dependencies: [],
        priority: 'high',
        status: 'in-progress',
        description: 'Implement multi-agent system using LangGraph',
        subtasks: [
          {
            id: 't1-1',
            name: 'Agent Architecture Design',
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            progress: 100,
            assignee: 'AI Team',
            dependencies: [],
            priority: 'high',
            status: 'completed',
          },
          {
            id: 't1-2',
            name: 'Implement Core Agents',
            startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            progress: 40,
            assignee: 'AI Team',
            dependencies: ['t1-1'],
            priority: 'high',
            status: 'in-progress',
          }
        ]
      },
      {
        id: 't2',
        name: 'Data Collection Pipeline',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        progress: 80,
        assignee: 'Data Team',
        dependencies: [],
        priority: 'medium',
        status: 'in-progress',
      }
    ]
  },
  {
    id: 'oneai',
    name: 'One AI',
    type: 'oneai',
    color: 'bg-green-500',
    icon: <Sparkles className="w-4 h-4" />,
    tasks: [
      {
        id: 't3',
        name: 'Production Pipeline',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        progress: 30,
        assignee: 'Production Team',
        dependencies: [],
        priority: 'medium',
        status: 'in-progress',
      }
    ]
  },
  {
    id: 'neuronet',
    name: 'NeuroNet',
    type: 'neuronet',
    color: 'bg-purple-500',
    icon: <GitBranch className="w-4 h-4" />,
    tasks: [
      {
        id: 't4',
        name: 'Model Training Automation',
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        progress: 0,
        assignee: 'ML Team',
        dependencies: ['t1'],
        priority: 'low',
        status: 'pending',
      }
    ]
  },
  {
    id: 'user',
    name: 'User Tasks',
    type: 'user',
    color: 'bg-orange-500',
    icon: <User className="w-4 h-4" />,
    tasks: [
      {
        id: 't5',
        name: 'System Review',
        startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString(),
        progress: 0,
        assignee: 'User',
        dependencies: ['t1', 't2'],
        priority: 'high',
        status: 'pending',
      }
    ]
  }
];

export default Scheduling;