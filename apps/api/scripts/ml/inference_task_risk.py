import sys
import os
import json
import torch
import torch.nn.functional as F
from task_risk_model import TaskRiskClassifier, text_to_bow, RISKS

def run_inference(artifact_path, inputs):
    if not os.path.exists(artifact_path):
        print(json.dumps({"error": f"Artifact not found at {artifact_path}"}))
        sys.exit(1)
        
    model = TaskRiskClassifier()
    model.load_state_dict(torch.load(artifact_path, weights_only=True))
    model.eval()
    
    with torch.no_grad():
        title = inputs.get("title", "")
        desc = inputs.get("description", "")
        priority = inputs.get("priority", "")
        workload = inputs.get("workload", "")
        text = f"{title} {desc} {priority} {workload}"
        
        bow = text_to_bow(text)
        X = torch.tensor([bow], dtype=torch.float32)
        
        outputs = model(X)
        probs = F.softmax(outputs, dim=1).squeeze().tolist()
        
        return probs

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python inference_task_risk.py <artifact_path> '<json_inputs>'"}))
        sys.exit(1)
        
    artifact_path = sys.argv[1]
    
    try:
        inputs = json.loads(sys.argv[2])
    except json.JSONDecodeError:
        print(json.dumps({"error": "Inputs must be valid JSON object"}))
        sys.exit(1)
        
    try:
        predictions = run_inference(artifact_path, inputs)
        print(json.dumps({"predictions": predictions}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
