// frontend/src/components/Argosa/function/DBCenter.tsx

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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Database,
  GitBranch,
  Archive,
  Search,
  Plus,
  Trash,
  RefreshCw,
  Download,
  Upload,
  Shield,
  Zap,
  Brain,
  Network,
  HardDrive,
  Activity,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

// Types
interface DBCollection {
  id: string;
  name: string;
  type: 'neo4j' | 'vector' | 'hybrid';
  size: number;
  documents: number;
  lastUpdated: string;
  status: 'active' | 'syncing' | 'error';
}

interface StorageStats {
  totalSize: number;
  usedSize: number;
  collections: number;
  queries: number;
  avgResponseTime: number;
}

const DBCenter: React.FC = () => {
  const [collections, setCollections] = useState<DBCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<DBCollection | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats>({
    totalSize: 100 * 1024 * 1024 * 1024, // 100GB
    usedSize: 32 * 1024 * 1024 * 1024, // 32GB
    collections: 0,
    queries: 0,
    avgResponseTime: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadCollections();
    loadStats();
  }, []);

  const loadCollections = async () => {
    try {
      const response = await fetch('/api/argosa/db/collections');
      if (response.ok) {
        const data = await response.json();
        setCollections(data);
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
      // Mock data
      setCollections([
        {
          id: '1',
          name: 'analysis_results',
          type: 'vector',
          size: 1.2 * 1024 * 1024 * 1024,
          documents: 15420,
          lastUpdated: new Date().toISOString(),
          status: 'active',
        },
        {
          id: '2',
          name: 'project_relationships',
          type: 'neo4j',
          size: 800 * 1024 * 1024,
          documents: 8930,
          lastUpdated: new Date().toISOString(),
          status: 'active',
        },
        {
          id: '3',
          name: 'user_feedback',
          type: 'hybrid',
          size: 450 * 1024 * 1024,
          documents: 3256,
          lastUpdated: new Date().toISOString(),
          status: 'syncing',
        },
      ]);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/argosa/db/stats');
      if (response.ok) {
        const data = await response.json();
        setStorageStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const syncDatabase = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/argosa/db/sync', { method: 'POST' });
      await loadCollections();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getTypeIcon = (type: DBCollection['type']) => {
    switch (type) {
      case 'neo4j': return <GitBranch className="w-4 h-4" />;
      case 'vector': return <Network className="w-4 h-4" />;
      case 'hybrid': return <Brain className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: DBCollection['status']) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'syncing': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
    }
  };

  const usagePercentage = (storageStats.usedSize / storageStats.totalSize) * 100;

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Database Center
          </h2>
          <p className="text-muted-foreground">
            Manage AI knowledge storage and retrieval
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search collections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="icon">
              <Search className="w-4 h-4" />
            </Button>
          </div>
          <Button 
            onClick={syncDatabase}
            disabled={isSyncing}
            variant="outline"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync All
              </>
            )}
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Collection
          </Button>
        </div>
      </div>

      {/* Storage Overview */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Storage Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress value={usagePercentage} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {formatBytes(storageStats.usedSize)} / {formatBytes(storageStats.totalSize)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4" />
              Collections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{collections.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Queries Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{storageStats.queries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Avg Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{storageStats.avgResponseTime}ms</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6">
        {/* Collections List */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Data Collections</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-400px)]">
              <div className="space-y-3 pr-4">
                {collections
                  .filter(c => !searchQuery || c.name.includes(searchQuery))
                  .map((collection) => (
                    <motion.div
                      key={collection.id}
                      whileHover={{ scale: 1.01 }}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedCollection?.id === collection.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedCollection(collection)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-gray-100 rounded">
                            {getTypeIcon(collection.type)}
                          </div>
                          <div>
                            <h4 className="font-medium flex items-center gap-2">
                              {collection.name}
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(collection.status)}`} />
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {collection.documents.toLocaleString()} documents
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Last updated: {new Date(collection.lastUpdated).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{collection.type}</Badge>
                          <p className="text-sm font-medium mt-1">
                            {formatBytes(collection.size)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Collection Details */}
        {selectedCollection && (
          <Card className="w-96">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{selectedCollection.name}</span>
                <Badge>{selectedCollection.type}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="schema">Schema</TabsTrigger>
                  <TabsTrigger value="actions">Actions</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4">
                  <div>
                    <Label>Storage Type</Label>
                    <p className="text-sm text-muted-foreground capitalize">
                      {selectedCollection.type === 'neo4j' ? 'Graph Database' :
                       selectedCollection.type === 'vector' ? 'Vector Database' :
                       'Hybrid Storage'}
                    </p>
                  </div>
                  <div>
                    <Label>Documents</Label>
                    <p className="text-sm text-muted-foreground">
                      {selectedCollection.documents.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label>Size</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatBytes(selectedCollection.size)}
                    </p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(selectedCollection.status)}`} />
                      <span className="text-sm capitalize">{selectedCollection.status}</span>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="schema" className="space-y-4">
                  {selectedCollection.type === 'neo4j' ? (
                    <Alert>
                      <GitBranch className="h-4 w-4" />
                      <AlertTitle>Graph Schema</AlertTitle>
                      <AlertDescription>
                        Nodes: Task, Project, User<br />
                        Relationships: DEPENDS_ON, CREATED_BY, ASSIGNED_TO
                      </AlertDescription>
                    </Alert>
                  ) : selectedCollection.type === 'vector' ? (
                    <Alert>
                      <Network className="h-4 w-4" />
                      <AlertTitle>Vector Schema</AlertTitle>
                      <AlertDescription>
                        Dimensions: 1536<br />
                        Distance Metric: Cosine<br />
                        Index Type: HNSW
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert>
                      <Brain className="h-4 w-4" />
                      <AlertTitle>Hybrid Schema</AlertTitle>
                      <AlertDescription>
                        Combines graph relationships with vector embeddings
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>
                
                <TabsContent value="actions" className="space-y-2">
                  <Button className="w-full" variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Export Data
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    Import Data
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Archive className="w-4 h-4 mr-2" />
                    Create Backup
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Shield className="w-4 h-4 mr-2" />
                    Access Control
                  </Button>
                  <Button className="w-full" variant="destructive">
                    <Trash className="w-4 h-4 mr-2" />
                    Delete Collection
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Status Alert */}
      {collections.some(c => c.status === 'error') && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Database Error</AlertTitle>
          <AlertDescription>
            Some collections are experiencing issues. Please check the logs.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default DBCenter;