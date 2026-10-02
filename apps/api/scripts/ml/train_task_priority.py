import sys
import os
import csv
import json
import torch
import torch.nn as nn
import torch.optim as optim
from task_priority_model import TaskPriorityClassifier, text_to_bow, PRIORITIES

def load_data(csv_path):
    X = []
    y = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            title = row['title']
            desc = row['description']
            priority = row['priority']
            
            bow = text_to_bow(title + " " + desc)
            X.append(bow)
            y.append(PRIORITIES.index(priority))
            
    return torch.tensor(X, dtype=torch.float32), torch.tensor(y, dtype=torch.long)

def train(train_csv, val_csv, epochs, lr, output_dir):
    print(f"Loading data...")
    X_train, y_train = load_data(train_csv)
    X_val, y_val = load_data(val_csv)
    
    model = TaskPriorityClassifier()
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)
    
    print(f"Starting training for {epochs} epochs...")
    for epoch in range(epochs):
        model.train()
        optimizer.zero_grad()
        
        outputs = model(X_train)
        loss = criterion(outputs, y_train)
        loss.backward()
        optimizer.step()
        
        if (epoch + 1) % 10 == 0:
            model.eval()
            with torch.no_grad():
                val_outputs = model(X_val)
                val_loss = criterion(val_outputs, y_val)
                _, predicted = torch.max(val_outputs.data, 1)
                correct = (predicted == y_val).sum().item()
                acc = correct / y_val.size(0)
            
            # Print in format HEARTBEAT|progress|epoch
            progress = (epoch + 1) / epochs
            print(f"HEARTBEAT|{progress:.2f}|{epoch+1}")
            
    # Final evaluation
    model.eval()
    with torch.no_grad():
        val_outputs = model(X_val)
        val_loss = criterion(val_outputs, y_val)
        _, predicted = torch.max(val_outputs.data, 1)
        correct = (predicted == y_val).sum().item()
        val_acc = correct / y_val.size(0)
        
    print(f"TRAINING_COMPLETED")
    print(json.dumps({
        "finalLoss": val_loss.item(),
        "finalAccuracy": val_acc,
        "epochsCompleted": epochs,
        "throughput": "CPU Local"
    }))
    
    # Save artifact
    os.makedirs(output_dir, exist_ok=True)
    artifact_path = os.path.join(output_dir, "model_artifact.pt")
    torch.save(model.state_dict(), artifact_path)
    
    print(f"Artifact created at: {artifact_path}")

if __name__ == '__main__':
    if len(sys.argv) < 6:
        print("Usage: python train_task_priority.py <train_csv> <val_csv> <epochs> <lr> <output_dir>")
        sys.exit(1)
        
    train(sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), sys.argv[5])
