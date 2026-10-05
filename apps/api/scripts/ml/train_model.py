import sys
import os
import csv
import time
import hashlib
import torch
import torch.nn as nn
import torch.optim as optim

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

def train(dataset_path, artifact_path, epochs=200):
    print("STARTING_TRAINING")
    
    # Load Dataset
    if not os.path.exists(dataset_path):
        print(f"ERROR|Dataset not found at {dataset_path}")
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
    
    # Initialize Model
    model = SimpleMLP()
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.05)
    
    # Training Loop
    for epoch in range(1, epochs + 1):
        optimizer.zero_grad()
        outputs = model(X)
        loss = criterion(outputs, y)
        loss.backward()
        optimizer.step()
        
        # Report progress
        if epoch % 10 == 0 or epoch == 1:
            print(f"METRIC_LOG|loss|{loss.item():.4f}|{epoch}")
            print(f"HEARTBEAT|{epoch / epochs:.2f}|{epoch}")
            # simulate a tiny bit of time passing for realism
            time.sleep(0.05)
            
    # Save Artifact
    os.makedirs(os.path.dirname(artifact_path), exist_ok=True)
    torch.save(model.state_dict(), artifact_path)
    
    # Calculate SHA256 Hash
    sha256_hash = hashlib.sha256()
    with open(artifact_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
            
    file_hash = sha256_hash.hexdigest()
    
    print(f"ARTIFACT_CREATED|{artifact_path}|{file_hash}")
    print("TRAINING_COMPLETED")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python train_model.py <dataset_path> <artifact_path> [epochs]")
        sys.exit(1)
        
    dataset_path = sys.argv[1]
    artifact_path = sys.argv[2]
    epochs = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    
    train(dataset_path, artifact_path, epochs)
