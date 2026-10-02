import sys
import os
import json
import torch
import torch.nn as nn

class SimpleMLP(nn.Module):
    def __init__(self):
        super(SimpleMLP, self).__init__()
        self.fc1 = nn.Linear(2, 16)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(16, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        out = self.fc1(x)
        out = self.relu(out)
        out = self.fc2(out)
        out = self.sigmoid(out)
        return out

def run_inference(artifact_path, inputs):
    if not os.path.exists(artifact_path):
        print(json.dumps({"error": f"Artifact not found at {artifact_path}"}))
        sys.exit(1)
        
    model = SimpleMLP()
    model.load_state_dict(torch.load(artifact_path, weights_only=True))
    model.eval()
    
    with torch.no_grad():
        X = torch.tensor(inputs, dtype=torch.float32)
        outputs = model(X)
        predictions = outputs.squeeze().tolist()
        
        # If single output, ensure it's a list
        if not isinstance(predictions, list):
            predictions = [predictions]
            
        return predictions

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python inference.py <artifact_path> '<json_inputs>'"}))
        sys.exit(1)
        
    artifact_path = sys.argv[1]
    
    try:
        inputs = json.loads(sys.argv[2])
    except json.JSONDecodeError:
        print(json.dumps({"error": "Inputs must be valid JSON array of numerical arrays, e.g. [[0, 0], [1, 1]]"}))
        sys.exit(1)
        
    try:
        predictions = run_inference(artifact_path, inputs)
        print(json.dumps({"predictions": predictions}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
