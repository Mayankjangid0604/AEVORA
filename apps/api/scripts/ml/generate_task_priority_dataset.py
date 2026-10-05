import csv
import random
import os
import sys

def generate_samples(num_samples):
    # Keywords that influence priority
    urgent_keywords = ["crash", "outage", "production down", "critical bug", "security breach", "data loss"]
    high_keywords = ["error", "performance", "client complaint", "failing tests", "database", "timeout"]
    normal_keywords = ["feature", "update", "refactor", "design", "review", "add button", "migration"]
    low_keywords = ["typo", "documentation", "color tweak", "cleanup", "formatting", "nice to have"]

    samples = []
    
    for _ in range(num_samples):
        # 10% Urgent, 20% High, 50% Normal, 20% Low roughly
        r = random.random()
        if r < 0.1:
            priority = "URGENT"
            word = random.choice(urgent_keywords)
        elif r < 0.3:
            priority = "HIGH"
            word = random.choice(high_keywords)
        elif r < 0.8:
            priority = "NORMAL"
            word = random.choice(normal_keywords)
        else:
            priority = "LOW"
            word = random.choice(low_keywords)
            
        templates = [
            f"Fix the {word} in the main module",
            f"We have a {word} reported by the team",
            f"Please address the {word} issue ASAP",
            f"Task regarding {word} needed for next sprint",
            f"Investigate the {word} on the server"
        ]
        
        title = random.choice(templates)
        description = f"Description details for {word}."
        
        # Add some noise occasionally
        if random.random() < 0.05:
            title += " (Low Priority)" # Conflicting noise
            
        samples.append([title, description, priority])
        
    return samples

def save_split(samples, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['title', 'description', 'priority'])
        writer.writerows(samples)

def main(output_dir, num_samples=1000):
    print(f"Generating {num_samples} samples...")
    samples = generate_samples(num_samples)
    
    # Shuffle
    random.shuffle(samples)
    
    # Split 80/10/10
    train_end = int(num_samples * 0.8)
    val_end = int(num_samples * 0.9)
    
    train_samples = samples[:train_end]
    val_samples = samples[train_end:val_end]
    test_samples = samples[val_end:]
    
    save_split(train_samples, os.path.join(output_dir, 'task_priority_train.csv'))
    save_split(val_samples, os.path.join(output_dir, 'task_priority_val.csv'))
    save_split(test_samples, os.path.join(output_dir, 'task_priority_test.csv'))
    
    print(f"Saved {len(train_samples)} train, {len(val_samples)} val, {len(test_samples)} test samples to {output_dir}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python generate_task_priority_dataset.py <output_dir> [num_samples]")
        sys.exit(1)
        
    out_dir = sys.argv[1]
    n_samples = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    main(out_dir, n_samples)
