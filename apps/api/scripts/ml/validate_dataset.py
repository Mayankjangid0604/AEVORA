import sys
import csv
import json

def load_data(path):
    samples = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            samples.append(row)
    return samples

def validate(train_path, val_path, test_path):
    train = load_data(train_path)
    val = load_data(val_path)
    test = load_data(test_path)
    
    all_data = train + val + test
    
    report = {
        "total_samples": len(all_data),
        "train_samples": len(train),
        "val_samples": len(val),
        "test_samples": len(test),
        "issues": []
    }
    
    # 1. Missing Values
    missing = sum(1 for row in all_data if not row['title'] or not row['priority'])
    if missing > 0:
        report["issues"].append(f"{missing} rows have missing title or priority.")
        
    # 2. Invalid Labels
    valid_labels = {"LOW", "NORMAL", "HIGH", "URGENT"}
    invalid_labels = sum(1 for row in all_data if row['priority'] not in valid_labels)
    if invalid_labels > 0:
        report["issues"].append(f"{invalid_labels} rows have invalid priority labels.")
        
    # 3. Class Imbalance
    class_counts = {"LOW": 0, "NORMAL": 0, "HIGH": 0, "URGENT": 0}
    for row in train:
        if row['priority'] in class_counts:
            class_counts[row['priority']] += 1
            
    report["class_distribution_train"] = class_counts
    for k, v in class_counts.items():
        if v == 0:
            report["issues"].append(f"Class {k} has 0 samples in train set.")
            
    # 4. Data Leakage (exact title match between train and test)
    train_titles = set(row['title'] for row in train)
    test_titles = set(row['title'] for row in test)
    leakage = train_titles.intersection(test_titles)
    
    report["data_leakage_overlap_count"] = len(leakage)
    if len(leakage) > len(test) * 0.5:
         report["issues"].append("Severe data leakage: >50% of test titles exist in train set.")
         
    report["valid"] = len(report["issues"]) == 0
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: python validate_dataset.py <train_csv> <val_csv> <test_csv>"}))
        sys.exit(1)
        
    validate(sys.argv[1], sys.argv[2], sys.argv[3])
