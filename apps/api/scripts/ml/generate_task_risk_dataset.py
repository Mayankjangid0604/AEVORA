import csv
import random
import os
import sys

def main():
    if len(sys.argv) < 3:
        print("Usage: python generate_task_risk_dataset.py <output_dir> <num_samples>")
        sys.exit(1)
        
    out_dir = sys.argv[1]
    num_samples = int(sys.argv[2])
    os.makedirs(out_dir, exist_ok=True)
    
    out_train = os.path.join(out_dir, "task_risk_train.csv")
    out_val = os.path.join(out_dir, "task_risk_val.csv")
    
    titles = [
        "Fix crash in production",
        "Update documentation",
        "Add new feature button",
        "Critical database timeout",
        "Refactor legacy code",
        "Weekly status report"
    ]
    
    descs = [
        "The system crashes on startup with unknown dependencies.",
        "Just a minor update to the formatting.",
        "Overdue task that blocked the release.",
        "Simple styling tweak.",
        "High risk migration required."
    ]
    
    priorities = ["LOW", "NORMAL", "HIGH", "URGENT"]
    workloads = ["1", "3", "5", "10", "20"]
    
    def generate_row():
        t = random.choice(titles)
        d = random.choice(descs)
        p = random.choice(priorities)
        w = random.choice(workloads)
        
        # Heuristic risk assignment
        risk = "MEDIUM"
        if "crash" in t.lower() or "critical" in t.lower() or p == "URGENT":
            risk = "HIGH"
        elif "documentation" in t.lower() or p == "LOW":
            risk = "LOW"
            
        return {"title": t, "description": d, "priority": p, "workload": w, "risk": risk}
        
    def write_dataset(path, count):
        with open(path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=["title", "description", "priority", "workload", "risk"])
            writer.writeheader()
            for _ in range(count):
                writer.writerow(generate_row())

    write_dataset(out_train, num_samples)
    write_dataset(out_val, int(num_samples * 0.2))
    
    print(f"Generated task risk datasets in {out_dir}")

if __name__ == '__main__':
    main()
