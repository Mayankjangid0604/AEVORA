import csv
import sys
import os
import random

def generate_xor_dataset(output_path, num_samples=200):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['x1', 'x2', 'y'])
        for _ in range(num_samples):
            # Generate points around the 4 corners
            x1_base = random.choice([0.0, 1.0])
            x2_base = random.choice([0.0, 1.0])
            
            # Add some noise
            x1 = x1_base + random.uniform(-0.1, 0.1)
            x2 = x2_base + random.uniform(-0.1, 0.1)
            
            # XOR label
            y = 1 if x1_base != x2_base else 0
            
            writer.writerow([x1, x2, y])

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python generate_dataset.py <output_path>")
        sys.exit(1)
    
    output_path = sys.argv[1]
    num_samples = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    generate_xor_dataset(output_path, num_samples)
    print(f"Generated {num_samples} samples at {output_path}")
