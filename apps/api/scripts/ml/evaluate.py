import sys
import os
import json
import csv
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

def evaluate(dataset_path, artifact_path):
    if not os.path.exists(dataset_path):
        print(json.dumps({"error": f"Dataset not found at {dataset_path}"}))
        sys.exit(1)
    if not os.path.exists(artifact_path):
        print(json.dumps({"error": f"Artifact not found at {artifact_path}"}))
        sys.exit(1)
        
    X_list = []
    y_list = []
    with open(dataset_path, 'r') as f:
        reader = csv.reader(f)
        next(reader) # skip header
        for row in reader:
            if len(row) == 3:
                X_list.append([float(row[0]), float(row[1])])
                y_list.append([float(row[2])])
                
    X = torch.tensor(X_list, dtype=torch.float32)
    y = torch.tensor(y_list, dtype=torch.float32)
    
    model = SimpleMLP()
    try:
        model.load_state_dict(torch.load(artifact_path, weights_only=True))
    except Exception as e:
        print(json.dumps({"error": f"Failed to load artifact: {str(e)}"}))
        sys.exit(1)
        
    model.eval()
    criterion = nn.BCELoss()
    
    with torch.no_grad():
        outputs = model(X)
        loss = criterion(outputs, y).item()
        
        # Calculate accuracy for binary classification
        predictions = (outputs >= 0.5).float()
        correct = (predictions == y).sum().item()
        accuracy = correct / len(y)
        
        print(json.dumps({
            "metrics": {
                "loss": loss,
                "accuracy": accuracy,
                "correct": correct,
                "total": len(y)
            }
        }))

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python evaluate.py <dataset_path> <artifact_path>"}))
        sys.exit(1)
        
    dataset_path = sys.argv[1]
    artifact_path = sys.argv[2]
    
    evaluate(dataset_path, artifact_path)
