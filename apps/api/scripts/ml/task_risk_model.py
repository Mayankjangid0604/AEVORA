import torch
import torch.nn as nn
import re

VOCAB = [
    "urgent", "critical", "crash", "high", "risk", "deadline", "delay", "blocked",
    "complex", "unknown", "dependencies", "overdue", "normal", "low", "easy", "routine",
    "bug", "feature", "update", "priority", "workload", "heavy", "light"
]
RISKS = ["LOW", "MEDIUM", "HIGH"]

def text_to_bow(text):
    text = text.lower()
    words = re.findall(r'\w+', text)
    bow = [0.0] * len(VOCAB)
    for w in words:
        if w in VOCAB:
            bow[VOCAB.index(w)] += 1.0
    return bow

class TaskRiskClassifier(nn.Module):
    def __init__(self):
        super(TaskRiskClassifier, self).__init__()
        self.fc1 = nn.Linear(len(VOCAB), 16)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(16, len(RISKS))
        
    def forward(self, x):
        out = self.fc1(x)
        out = self.relu(out)
        out = self.fc2(out)
        return out
