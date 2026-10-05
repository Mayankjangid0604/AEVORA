# AEVORA - Phase 14: Model Development & Training Infrastructure

## Overview
Phase 14 introduces the underlying model training pipeline and infrastructure for AEVORA. The AI Research & Development Laboratory (Phase 13) handles governance, version control, dataset management, and benchmark suites, but this phase implements the actual resource provisioning, scheduling, executor lifecycle, and metric tracking needed to produce Model Artifacts.

## Architecture

The system utilizes an abstract executor pattern (`TrainingExecutor`) orchestrated via the `TrainingGateway` to allow for distinct compute environments while maintaining identical lifecycle tracking.

### Core Components
1. **TrainingGateway**: The central router for all training executions. It registers available executors and dispatches `TrainingRunAttempt` requests based on the requested executor type.
2. **TrainingExecutor**: An interface defining the lifecycle of an executor (`execute`, `cancel`, `getIdentifier`). 
3. **SimulatedTrainingExecutor**: The MVP executor implementation. It provides deterministic, synchronous training simulations. It does not perform actual compute-intensive deep learning but tracks state and emits model artifacts strictly for platform progression.
4. **TrainingService**: Handles business logic for starting, monitoring, tracking consumption, checking budget constraints, and updating status states of training runs.
5. **ArtifactService**: Bridges the training infrastructure with Phase 13 governance, managing the promotion of raw `ModelArtifact` outputs from successful training runs into formal `ModelVersion` entities.

### Schema Entities
- `TrainingConfiguration`: Immutable definition of hyperparameters, compute budget, hardware specs, and base models.
- `TrainingRun`: Represents the overarching logical execution of a configuration over specific dataset paths. Tracks overall progress, metrics summary, and resource consumption.
- `TrainingRunAttempt`: Retries or partial executions of a training run, mapping to physical executor deployments.
- `TrainingCheckpoint`: Intermittent weight saves during a training run.
- `TrainingMetric`: Timeseries observations (loss, throughput, utilization).
- `ModelArtifact`: The raw outputs (e.g. weights) produced by a successful training run.

## Resource Constraints and Budgeting
To maintain strict economic reality:
1. `TrainingConfiguration` imposes a `maxComputeUnits` limit.
2. `TrainingService` checks the `ResearchProject` budget via the `EconomyService` (Phase 2A) before starting any run.
3. Compute units are translated to AC (Aevora Credits) and deducted immediately. Failed transactions strictly prevent execution.

## Next Steps (Future Phases)
- Implementation of cloud-provider executors (e.g. AWS Sagemaker, GCP Vertex AI).
- Live metrics streaming via WebSockets.
- Fully distributed queueing (e.g. BullMQ) for asynchronous training attempts.
