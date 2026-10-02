# Phase 16: First Real ML Training & Proprietary Model Pipeline

This document describes the first genuine, reproducible, end-to-end ML training pipeline inside AEVORA, implemented as Phase 16.

## Architecture

Phase 16 introduced the `LocalPythonTrainingExecutor`, a new implementation of `TrainingExecutor` that connects the AEVORA compute scheduler (Phase 15) to a real, out-of-process Python ML training runtime.

Unlike the `SimulatedTrainingExecutor` which merely waited and generated fake JSON files, the `LocalPythonTrainingExecutor`:
1. Spawns a dedicated, isolated `python` child process.
2. Executes genuine numerical optimization using **PyTorch**.
3. Monitors the process `stdout` for realtime metrics (`loss`, `epochs`) and heartbeats.
4. Captures the generated `.pt` binary artifact and its SHA-256 cryptographic hash.
5. Surfaces the real model artifact to the `TrainingGateway` for registration into the `ModelRegistry`.

## Runtime

The training runtime is orchestrated by `apps/api/src/research/training/local-python.training-executor.ts`.
It relies on two main python scripts located in `apps/api/scripts/ml/`:
- `train_model.py`: Uses `torch` and `torch.nn` to define a Multi-Layer Perceptron (MLP), instantiate an Adam optimizer, compute Binary Cross-Entropy loss (BCE), execute backward passes, and serialize the trained weights.
- `inference.py`: Loads the registered `.pt` artifact, reconstructs the network, and runs an actual forward inference pass.

## Dataset & Reproducibility

To ensure the pipeline is reproducible, deterministic, and extremely fast, Phase 16 uses a controlled synthetic binary classification dataset (XOR logic gates) with added noise. 
- The dataset is generated via `generate_dataset.py` and saved as a CSV.
- The dataset is formally registered in AEVORA via `DatasetService` as a specific `DatasetVersion`.
- The `TrainingConfiguration` explicitly links to the immutable `DatasetVersion`.

## Artifacts & Registration

Upon completion, the python runtime saves a standard `model_artifact.pt` file. It computes the SHA-256 hash of the binary file to ensure immutability and provenance. 
The AEVORA `TrainingGateway` then:
1. Registers the file in the `ModelRegistry`.
2. Creates a `ModelArtifact` record linked to the `TrainingRun`.
3. Creates an immutable `ModelVersion` linked to the artifact and the hash.

## Evaluation & Safety

After registration, the `ModelVersion` is passed through the standard Phase 13 evaluation framework.
- An **Inference Smoke Test** guarantees that the binary artifact is actually a loadable PyTorch model and not a mock file.
- The `EvaluationRun` and `SafetyEvaluation` records are created and tied to the `ModelVersion`.
- A failed safety evaluation will block promotion to production.

## Promotion & Governance

The resulting model is initially registered as `EXPERIMENTAL`. 
Agents are expressly prohibited from autonomously deploying or promoting the model. Promotion to `STABLE` or `PRODUCTION` requires explicit governance steps (e.g. Chairman approval) via the existing Control Center.

## Compute & Isolation

The Python process runs entirely out-of-process, honoring the isolation boundaries established in Phase 15. The `LocalPythonTrainingExecutor` accurately records execution duration, compute units, and intercepts stderr to ensure graceful failure reporting if the python runtime crashes or times out.

## Limitations

- Currently limited to single-node CPU execution.
- Relies on PyTorch being available in the host environment.
- The first model is deliberately tiny to prove the end-to-end pipeline architecture without incurring massive cloud costs or uncontrollable AI alignment risks. 
