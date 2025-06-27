// frontend/src/components/Argosa/function/Prediction.tsx

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight,
  MessageSquare,
  Plus,
  TrendingUp,
  Zap,
  GitBranch,
  Code2,
  Sparkles,
  Calendar,
  User,
  Send,
  Brain,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
// Date formatting helper
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Types
interface PredictionCard {
  id: string;
  title: string;
  content: string;
  improvements: string[];
  futureFeatures: string[];
  status: 'idea' | 'planning' | 'development' | 'testing' | 'deployed';
  priority: 'low' | 'medium' | 'high';
  category: 'concept' | 'service' | 'code' | 'feature';
  createdAt: string;
  updatedAt: string;
  author: string;
  comments: Comment[];
  predictions: Prediction[];
  progress: number;
}

interface Comment {
  id: string;
  text: string;
  author: string;
  timestamp: string;
  isApplied: boolean;
}

interface Prediction {
  id: string;
  description: string;
  probability: number;
  impact: 'low' | 'medium' | 'high';
  timeframe: string;
}

const Prediction: React.FC = () => {
  const [cards, setCards] = useState<PredictionCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<PredictionCard | null>(null);
  const [newComment, setNewComment] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [newCardData, setNewCardData] = useState({
    title: "",
    content: "",
    category: "concept" as PredictionCard['category'],
    priority: "medium" as PredictionCard['priority'],
  });

  // Load cards from backend
  useEffect(() => {
    loadPredictionCards();
  }, []);

  const loadPredictionCards = async () => {
    try {
      const response = await fetch('/api/argosa/predictions');
      if (response.ok) {
        const data = await response.json();
        setCards(data);
      }
    } catch (error) {
      console.error('Failed to load prediction cards:', error);
      // Use mock data for development
      setCards(mockCards);
    }
  };

  const handleCreateCard = async () => {
    const newCard: PredictionCard = {
      id: `card_${Date.now()}`,
      ...newCardData,
      improvements: [],
      futureFeatures: [],
      status: 'idea',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'Current User',
      comments: [],
      predictions: [],
      progress: 0,
    };

    try {
      const response = await fetch('/api/argosa/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCard),
      });

      if (response.ok) {
        const createdCard = await response.json();
        setCards([...cards, createdCard]);
      }
    } catch (error) {
      console.error('Failed to create card:', error);
      // Add locally for development
      setCards([...cards, newCard]);
    }

    setIsCreatingCard(false);
    setNewCardData({
      title: "",
      content: "",
      category: "concept",
      priority: "medium",
    });
  };

  const handleAddComment = async (cardId: string) => {
    if (!newComment.trim()) return;

    const comment: Comment = {
      id: `comment_${Date.now()}`,
      text: newComment,
      author: 'Current User',
      timestamp: new Date().toISOString(),
      isApplied: false,
    };

    try {
      const response = await fetch(`/api/argosa/predictions/${cardId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comment),
      });

      if (response.ok) {
        const updatedCard = await response.json();
        setCards(cards.map(card => 
          card.id === cardId ? updatedCard : card
        ));
        if (selectedCard?.id === cardId) {
          setSelectedCard(updatedCard);
        }
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
      // Update locally for development
      const updatedCards = cards.map(card => {
        if (card.id === cardId) {
          return { ...card, comments: [...card.comments, comment] };
        }
        return card;
      });
      setCards(updatedCards);
      if (selectedCard?.id === cardId) {
        setSelectedCard({
          ...selectedCard,
          comments: [...selectedCard.comments, comment]
        });
      }
    }

    setNewComment("");
  };

  const getStatusColumns = () => {
    const columns = {
      idea: [] as PredictionCard[],
      planning: [] as PredictionCard[],
      development: [] as PredictionCard[],
      testing: [] as PredictionCard[],
      deployed: [] as PredictionCard[],
    };

    cards
      .filter(card => filterCategory === 'all' || card.category === filterCategory)
      .filter(card => filterStatus === 'all' || card.status === filterStatus)
      .forEach(card => {
        columns[card.status].push(card);
      });

    return columns;
  };

  const updateCardStatus = async (cardId: string, newStatus: PredictionCard['status']) => {
    try {
      const response = await fetch(`/api/argosa/predictions/${cardId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const updatedCard = await response.json();
        setCards(cards.map(card => 
          card.id === cardId ? updatedCard : card
        ));
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      // Update locally for development
      setCards(cards.map(card => 
        card.id === cardId ? { ...card, status: newStatus, updatedAt: new Date().toISOString() } : card
      ));
    }
  };

  const columns = getStatusColumns();

  const getStatusIcon = (status: PredictionCard['status']) => {
    switch (status) {
      case 'idea': return <Sparkles className="w-4 h-4" />;
      case 'planning': return <GitBranch className="w-4 h-4" />;
      case 'development': return <Code2 className="w-4 h-4" />;
      case 'testing': return <Target className="w-4 h-4" />;
      case 'deployed': return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: PredictionCard['category']) => {
    switch (category) {
      case 'concept': return 'bg-blue-500';
      case 'service': return 'bg-green-500';
      case 'code': return 'bg-purple-500';
      case 'feature': return 'bg-orange-500';
    }
  };

  const getPriorityColor = (priority: PredictionCard['priority']) => {
    switch (priority) {
      case 'low': return 'text-gray-500';
      case 'medium': return 'text-yellow-500';
      case 'high': return 'text-red-500';
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Prediction Model - Development Kanban
          </h2>
          <p className="text-muted-foreground">
            Track and predict development progress with AI-powered insights
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Filters */}
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="concept">Concept</SelectItem>
              <SelectItem value="service">Service</SelectItem>
              <SelectItem value="code">Code</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="idea">Idea</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
              <SelectItem value="deployed">Deployed</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setIsCreatingCard(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Card
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-w-max">
          {Object.entries(columns).map(([status, statusCards]) => (
            <div key={status} className="flex-1 min-w-[350px]">
              <div className="bg-gray-100 rounded-lg p-4 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium capitalize flex items-center gap-2">
                    {getStatusIcon(status as PredictionCard['status'])}
                    {status}
                  </h3>
                  <Badge variant="secondary">{statusCards.length}</Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-3 pr-4">
                    <AnimatePresence>
                      {statusCards.map((card) => (
                        <motion.div
                          key={card.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          whileHover={{ scale: 1.02 }}
                          className="cursor-pointer"
                          onClick={() => setSelectedCard(card)}
                        >
                          <Card className="hover:shadow-lg transition-shadow">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <CardTitle className="text-base">{card.title}</CardTitle>
                                <div className={`w-2 h-2 rounded-full ${getCategoryColor(card.category)}`} />
                              </div>
                              <CardDescription className="text-xs line-clamp-2">
                                {card.content}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="pb-3">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <User className="w-3 h-3" />
                                  <span>{card.author}</span>
                                </div>
                                <Zap className={`w-4 h-4 ${getPriorityColor(card.priority)}`} />
                              </div>
                              <div className="mt-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <MessageSquare className="w-3 h-3" />
                                  <span className="text-xs">{card.comments.length}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-green-500 transition-all"
                                      style={{ width: `${card.progress}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground">{card.progress}%</span>
                                </div>
                              </div>
                            </CardContent>
                            <CardFooter className="pt-0 pb-3">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextStatus = {
                                    idea: 'planning',
                                    planning: 'development',
                                    development: 'testing',
                                    testing: 'deployed',
                                    deployed: 'deployed',
                                  }[card.status] as PredictionCard['status'];
                                  updateCardStatus(card.id, nextStatus);
                                }}
                                disabled={card.status === 'deployed'}
                              >
                                Move to next stage
                                <ChevronRight className="w-3 h-3 ml-1" />
                              </Button>
                            </CardFooter>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </ScrollArea>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card Detail Dialog */}
      <Dialog open={!!selectedCard} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedCard && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedCard.title}</DialogTitle>
                <DialogDescription>
                  <div className="flex items-center gap-4 mt-2">
                    <Badge variant="outline">{selectedCard.category}</Badge>
                    <Badge variant="secondary">{selectedCard.status}</Badge>
                    <Badge className={getPriorityColor(selectedCard.priority)}>
                      {selectedCard.priority} priority
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Updated {formatDate(selectedCard.updatedAt)}
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-6">
                {/* Content */}
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">{selectedCard.content}</p>
                </div>

                {/* Improvements */}
                {selectedCard.improvements.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Improvements</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {selectedCard.improvements.map((improvement, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          {improvement}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Future Features */}
                {selectedCard.futureFeatures.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Future Features
                    </h4>
                    <div className="space-y-2">
                      {selectedCard.futureFeatures.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Sparkles className="w-4 h-4 text-yellow-500 mt-0.5" />
                          <span className="text-sm text-muted-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Predictions */}
                {selectedCard.predictions.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      AI Predictions
                    </h4>
                    <div className="space-y-3">
                      {selectedCard.predictions.map((prediction) => (
                        <Card key={prediction.id} className="p-3">
                          <div className="flex items-start justify-between">
                            <p className="text-sm flex-1">{prediction.description}</p>
                            <Badge variant={
                              prediction.impact === 'high' ? 'destructive' :
                              prediction.impact === 'medium' ? 'default' :
                              'secondary'
                            }>
                              {prediction.impact} impact
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500 transition-all"
                                  style={{ width: `${prediction.probability}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {prediction.probability}% probability
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {prediction.timeframe}
                            </span>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <h4 className="font-medium mb-3">Comments & Feedback</h4>
                  <ScrollArea className="h-[200px] mb-3">
                    <div className="space-y-3 pr-4">
                      {selectedCard.comments.map((comment) => (
                        <div key={comment.id} className="border-l-2 pl-3 py-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{comment.author}</span>
                            <div className="flex items-center gap-2">
                              {comment.isApplied && (
                                <Badge variant="outline" className="text-xs">
                                  Applied
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDate(comment.timestamp)}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{comment.text}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add your comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={2}
                      className="flex-1"
                    />
                    <Button 
                      onClick={() => handleAddComment(selectedCard.id)}
                      disabled={!newComment.trim()}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Card Dialog */}
      <Dialog open={isCreatingCard} onOpenChange={setIsCreatingCard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Prediction Card</DialogTitle>
            <DialogDescription>
              Add a new development concept, service, or feature to track
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newCardData.title}
                onChange={(e) => setNewCardData({ ...newCardData, title: e.target.value })}
                placeholder="Enter card title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Description</Label>
              <Textarea
                id="content"
                value={newCardData.content}
                onChange={(e) => setNewCardData({ ...newCardData, content: e.target.value })}
                placeholder="Describe the concept or feature"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select 
                  value={newCardData.category} 
                  onValueChange={(value: PredictionCard['category']) => 
                    setNewCardData({ ...newCardData, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concept">Concept</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="code">Code</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select 
                  value={newCardData.priority} 
                  onValueChange={(value: PredictionCard['priority']) => 
                    setNewCardData({ ...newCardData, priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreatingCard(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateCard}
                disabled={!newCardData.title || !newCardData.content}
              >
                Create Card
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Mock data for development
const mockCards: PredictionCard[] = [
  {
    id: '1',
    title: 'LangGraph Integration',
    content: 'Implement multi-agent AI system using LangGraph for better coordination between different AI models',
    improvements: [
      'Better task delegation between agents',
      'Improved context sharing',
      'Reduced response latency'
    ],
    futureFeatures: [
      'Real-time agent collaboration',
      'Dynamic agent spawning based on task complexity',
      'Cross-model learning and adaptation'
    ],
    status: 'development',
    priority: 'high',
    category: 'code',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T15:30:00Z',
    author: 'AI Team',
    comments: [
      {
        id: 'c1',
        text: 'Need to consider memory management for multiple agents',
        author: 'Developer',
        timestamp: '2024-01-18T14:00:00Z',
        isApplied: true
      }
    ],
    predictions: [
      {
        id: 'p1',
        description: '40% reduction in overall processing time once fully implemented',
        probability: 85,
        impact: 'high',
        timeframe: '2 weeks'
      }
    ],
    progress: 65
  },
  {
    id: '2',
    title: 'Neo4j Graph Database Schema',
    content: 'Design and implement graph database schema for storing relationships between concepts, tasks, and outcomes',
    improvements: [
      'Faster query performance',
      'Better relationship visualization',
      'Simplified data modeling'
    ],
    futureFeatures: [
      'AI-powered relationship discovery',
      'Automatic schema optimization',
      'Real-time graph analytics'
    ],
    status: 'planning',
    priority: 'medium',
    category: 'service',
    createdAt: '2024-01-20T09:00:00Z',
    updatedAt: '2024-01-22T11:00:00Z',
    author: 'Data Team',
    comments: [],
    predictions: [
      {
        id: 'p2',
        description: 'Enable complex relationship queries in under 100ms',
        probability: 75,
        impact: 'medium',
        timeframe: '1 month'
      }
    ],
    progress: 30
  }
];

export default Prediction;