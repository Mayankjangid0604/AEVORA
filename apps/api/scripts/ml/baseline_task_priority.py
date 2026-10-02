import sys
import csv
import json

def baseline_predict(text):
    text = text.lower()
    
    urgent_keywords = ["crash", "outage", "critical", "breach", "loss"]
    high_keywords = ["error", "performance", "failing", "database", "timeout"]
    low_keywords = ["typo", "formatting", "cleanup", "tweak", "nice to have"]
    
    if any(k in text for k in urgent_keywords):
        return "URGENT"
    if any(k in text for k in high_keywords):
        return "HIGH"
    if any(k in text for k in low_keywords):
        return "LOW"
    
    return "NORMAL"

def evaluate_baseline(csv_path):
    correct = 0
    total = 0
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            title = row['title']
            desc = row['description']
            true_priority = row['priority']
            
            predicted = baseline_predict(title + " " + desc)
            if predicted == true_priority:
                correct += 1
            total += 1
            
    accuracy = correct / total if total > 0 else 0
    print(json.dumps({
        "accuracy": accuracy,
        "correct": correct,
        "total": total,
        "loss": 1.0 - accuracy # Pseudo-loss for compatibility
    }))

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python baseline_task_priority.py <test_csv>")
        sys.exit(1)
        
    evaluate_baseline(sys.argv[1])
