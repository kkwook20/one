AI Pipeline System - Quick Start Guide
🎯 System Overview
This is an AI-powered production pipeline where each node processes data step by step.
Your code runs inside a Worker node with access to inputs, AI models, and other nodes' outputs.
📥 Essential Variables (Always Available)
1. inputs / get_connected_outputs()

What: Data from nodes connected to your input
Usage: data = inputs or data = get_connected_outputs()
Returns: Dictionary like {"NodeLabel": {output_data}}

2. output (MUST SET!)

What: Your node's result - MUST be set for the pipeline to continue
Usage: output = {"result": processed_data}
Type: Can be dict, list, or string

3. current_node

What: Your node's complete configuration
Contains: id, type, label, purpose, outputFormat, tasks, model, lmStudioUrl, connectedFrom, supervised, running, deactivated
Usage: tasks = current_node['tasks']

4. Quick Access Variables

node_purpose - What your node should do
output_format_description - Expected output format
node_id - Current node's ID
section_name - Current section name
model_name - Selected AI model (e.g., "llama-3.2-3b" or "none")
lm_studio_url - LM Studio endpoint URL

5. call_ai_model(prompt, model=None, url=None)

What: Send prompts to the AI model
Usage: response = call_ai_model("Analyze this: " + str(data))
Returns: AI's text response or error dict

🚀 Minimal Working Example
python# Get input data
data = inputs.get('PreviousNode', {})

# Process with AI
if model_name != 'none':
    prompt = f"Task: {node_purpose}\nData: {data}\nFormat: {output_format_description}"
    result = call_ai_model(prompt)
else:
    result = "No AI model configured"

# IMPORTANT: Set output
output = {"result": result}
🔗 Global Variable Access
Access Any Node's Data
python# Format: {section}.{nodeType}.{nodeId}.{dataType}.{detail}
script_text = get_global_var("preproduction.input.input-script.output.text")
worker_result = get_global_var("modeling.worker.node-123.output")
task_status = get_global_var("animation.worker.node-456.tasks")
Available Data Types

.output - Node execution result
.files - Generated file paths
.code - Current Python code
.status - Running/deactivated state
.config - Node settings
.tasks - Task list with statuses
.history - Version history
.metadata - Execution metadata

Section-Level Access
python# Get all outputs from a section
all_preproduction = get_section_outputs("preproduction")

# For supervisor nodes - get managed nodes
managed_nodes = get_supervised_nodes()
📝 Task Processing Pattern
python# Update task status as you work
for task in current_node.get('tasks', []):
    update_task_status(task['id'], 'pending')
    log_progress(f"Starting: {task['text']}")
    
    # Do work for this task
    # ...
    
    update_task_status(task['id'], 'partial')  # or 'none' when complete

# Set final output
output = {"all_tasks": "complete", "results": combined_results}
⚡ Key Rules

ALWAYS set the output variable - or your node won't pass data forward
output must be JSON-serializable (dict, list, string, number, bool)
Check if AI model exists before calling: if model_name != 'none'
Use provided variables - don't try to access files or APIs directly
Log progress for long-running tasks: log_progress("Processing 50%")

🎨 Common Patterns
Multi-Model Processing
python# Use different models for different tasks
analysis = call_ai_model("Analyze this", model="llama-3.2-3b")
summary = call_ai_model("Summarize this", model="mistral-7b")
Cross-Section Data Flow
python# Get character data from preproduction
characters = get_global_var("preproduction.planning.char-node.output.characters")

# Get render settings from another section
settings = get_global_var("rendering.config.settings-node.output")

# Combine for your task
output = process_with_context(inputs, characters, settings)
Error Handling
pythontry:
    result = call_ai_model(prompt)
    if isinstance(result, dict) and 'error' in result:
        output = {"error": result['error'], "fallback": "Using default"}
    else:
        output = {"success": result}
except Exception as e:
    output = {"error": str(e)}