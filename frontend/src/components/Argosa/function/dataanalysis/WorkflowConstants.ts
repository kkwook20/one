// Workflow creation helper constants

export const DATA_SOURCE_SUGGESTIONS = {
  database: [
    "PostgreSQL",
    "MySQL", 
    "MongoDB",
    "Redis",
    "SQLite",
    "users_table",
    "sales_table",
    "products_table"
  ],
  files: [
    "data.csv",
    "report.xlsx",
    "logs.json",
    "analytics.parquet",
    "./data/",
    "s3://bucket/path"
  ],
  api: [
    "REST API",
    "GraphQL endpoint",
    "https://api.example.com/v1",
    "Webhook data",
    "External service"
  ],
  streaming: [
    "Kafka topic",
    "WebSocket feed",
    "RabbitMQ queue",
    "Real-time events"
  ]
};

export const CONSTRAINT_TEMPLATES = {
  time: [
    "Complete within 1 hour",
    "Complete within 30 minutes",
    "Real-time processing required",
    "Daily batch processing"
  ],
  performance: [
    "Process minimum 1000 records/second",
    "Response time under 100ms",
    "Use parallel processing",
    "Optimize for speed"
  ],
  security: [
    "No personally identifiable information (PII)",
    "GDPR compliant",
    "Encrypt sensitive data",
    "Audit trail required"
  ],
  resource: [
    "Use maximum 8GB RAM",
    "Single GPU only",
    "Cloud resources only",
    "On-premise only"
  ],
  quality: [
    "95% accuracy required",
    "Include error handling",
    "Add comprehensive logging",
    "Write unit tests"
  ],
  business: [
    "Budget under $1000",
    "Production ready",
    "Scalable solution",
    "Easy to maintain"
  ]
};

export const BUSINESS_GOALS_EXAMPLES = [
  "Improve customer retention by 20%",
  "Reduce operational costs",
  "Increase conversion rate",
  "Identify new market opportunities",
  "Optimize inventory management",
  "Enhance user experience",
  "Predict customer churn",
  "Automate manual processes"
];

export const ANALYSIS_OBJECTIVES_EXAMPLES = {
  data_analysis: [
    "Analyze customer behavior patterns",
    "Find trends in sales data",
    "Identify anomalies in system logs",
    "Generate monthly performance report",
    "Segment customers by behavior"
  ],
  code: [
    "Create REST API for user management",
    "Build data processing pipeline",
    "Implement authentication system",
    "Optimize database queries",
    "Refactor legacy code"
  ],
  hybrid: [
    "Analyze data and generate visualization code",
    "Build ML model and deployment code",
    "Create automated reporting system",
    "Design and implement data pipeline"
  ]
};