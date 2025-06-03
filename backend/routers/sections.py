# Related files: backend/main.py, backend/models.py, backend/storage.py
# Location: backend/routers/sections.py

from fastapi import APIRouter, HTTPException
from typing import List
import xml.etree.ElementTree as ET
import json
import yaml
from models import Section
from storage import sections_db

router = APIRouter(prefix="/sections", tags=["sections"])

@router.get("")
async def get_sections() -> List[Section]:
    """Get all sections"""
    return list(sections_db.values())

@router.get("/{section_id}")
async def get_section(section_id: str) -> Section:
    """Get specific section"""
    if section_id not in sections_db:
        raise HTTPException(status_code=404, detail="Section not found")
    return sections_db[section_id]

@router.post("")
async def create_section(section: Section) -> Section:
    """Create new section"""
    sections_db[section.id] = section
    return section

@router.put("/{section_id}")
async def update_section(section_id: str, section: Section) -> Section:
    """Update section"""
    sections_db[section_id] = section
    return section

@router.post("/export-output/{section_id}")
async def export_section_output(section_id: str):
    """Export section output in configured format"""
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Collect all node outputs
    outputs = {}
    for node in section.nodes:
        if node.output and not node.isDeactivated:
            outputs[node.label] = node.output
    
    # Format based on configuration
    format_type = section.outputConfig.format if section.outputConfig else "json"
    
    if format_type == "json":
        return outputs
    elif format_type == "yaml":
        import io
        stream = io.StringIO()
        yaml.dump(outputs, stream)
        return {"yaml": stream.getvalue()}
    elif format_type == "xml":
        root = ET.Element("output")
        for key, value in outputs.items():
            node_elem = ET.SubElement(root, "node", name=key)
            node_elem.text = json.dumps(value)
        return {"xml": ET.tostring(root, encoding="unicode")}
    
    return outputs