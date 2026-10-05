import torch
import torch.nn as nn
import re

VOCAB = [
    "crash", "outage", "critical", "bug", "security", "breach", "loss", "error", 
    "performance", "timeout", "database", "failing", "feature", "update", "refactor", 
    "design", "review", "button", "migration", "documentation", "typo", "formatting", 
    "cleanup", "tweak", "nice", "sprint"
]
PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"]

def text_to_bow(text):
    text = text.lower()
    words = re.findall(r'\w+', text)
    bow = [0.0] * len(VOCAB)
    for w in words:
        if w in VOCAB:
            bow[VOCAB.index(w)] += 1.0
    return bow

class TaskPriorityClassifier(nn.Module):
    def __init__(self):
        super(TaskPriorityClassifier, self).__init__()
        self.fc1 = nn.Linear(len(VOCAB), 32)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(32, len(PRIORITIES))
        
    def forward(self, x):
        out = self.fc1(x)
        out = self.relu(out)
        out = self.fc2(out)
        return out
