import { ModelGateway } from '../gateway';
import { Config } from '../config';
import { LocalProvider } from '../providers/LocalProvider';

jest.mock('../providers/LocalProvider');

describe('ModelGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear all model env vars so defaults take effect
    delete process.env.AEVORA_MODEL_FAST;
    delete process.env.AEVORA_MODEL_NORMAL;
    delete process.env.AEVORA_MODEL_COMPLEX;
    delete process.env.AEVORA_MODEL_CODING;
    delete process.env.AEVORA_MODEL_STRATEGIC;
    delete process.env.OLLAMA_DEFAULT_MODEL;
    delete process.env.OLLAMA_COMPLEX_MODEL;
    delete process.env.OLLAMA_CODE_MODEL;
    delete process.env.OLLAMA_VISION_MODEL;
    delete process.env.OLLAMA_FAST_MODEL;
    delete process.env.CEO_MODEL;
    delete process.env.CEO_MODEL_COMPLEX;
  });

  it('should route BASIC complexity to default model (gemma3:12b)', async () => {
    const gateway = new ModelGateway();
    const generateMock = jest.fn().mockResolvedValue({ model: 'gemma3:12b', usage: {} });
    (LocalProvider.prototype.generate as jest.Mock).mockImplementation(generateMock);

    await gateway.generate({ prompt: 'test', complexity: 'BASIC' });
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ targetModel: 'gemma3:12b' }));
  });

  it('should route undefined complexity to default model', async () => {
    const gateway = new ModelGateway();
    const generateMock = jest.fn().mockResolvedValue({ model: 'gemma3:12b', usage: {} });
    (LocalProvider.prototype.generate as jest.Mock).mockImplementation(generateMock);

    await gateway.generate({ prompt: 'test' });
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ targetModel: 'gemma3:12b' }));
  });

  it('should route COMPLEX complexity to complex model (qwen3:14b)', async () => {
    const gateway = new ModelGateway();
    const generateMock = jest.fn().mockResolvedValue({ model: 'qwen3:14b', usage: {} });
    (LocalProvider.prototype.generate as jest.Mock).mockImplementation(generateMock);

    await gateway.generate({ prompt: 'test', complexity: 'COMPLEX' });
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ targetModel: 'qwen3:14b' }));
  });

  it('should route CODE complexity to code model (qwen3-coder:30b)', async () => {
    const gateway = new ModelGateway();
    const generateMock = jest.fn().mockResolvedValue({ model: 'qwen3-coder:30b', usage: {} });
    (LocalProvider.prototype.generate as jest.Mock).mockImplementation(generateMock);

    await gateway.generate({ prompt: 'test', complexity: 'CODE' });
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ targetModel: 'qwen3-coder:30b' }));
  });

  it('should route VISION/STRATEGIC complexity to strategic model (qwen3:14b)', async () => {
    const gateway = new ModelGateway();
    const generateMock = jest.fn().mockResolvedValue({ model: 'qwen3:14b', usage: {} });
    (LocalProvider.prototype.generate as jest.Mock).mockImplementation(generateMock);

    await gateway.generate({ prompt: 'test', complexity: 'VISION' });
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ targetModel: 'qwen3:14b' }));

    await gateway.generate({ prompt: 'test', complexity: 'STRATEGIC' });
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ targetModel: 'qwen3:14b' }));
  });

  it('should route FAST complexity to fast model (qwen2.5:7b)', async () => {
    const gateway = new ModelGateway();
    const generateMock = jest.fn().mockResolvedValue({ model: 'qwen2.5:7b', usage: {} });
    (LocalProvider.prototype.generate as jest.Mock).mockImplementation(generateMock);

    await gateway.generate({ prompt: 'test', complexity: 'FAST' });
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ targetModel: 'qwen2.5:7b' }));
  });

  it('should respect AEVORA_MODEL_* env vars over OLLAMA_*_MODEL', async () => {
    process.env.AEVORA_MODEL_NORMAL = 'custom-normal:1b';
    process.env.OLLAMA_DEFAULT_MODEL = 'should-be-ignored';
    const gateway = new ModelGateway();
    const generateMock = jest.fn().mockResolvedValue({ model: 'custom-normal:1b', usage: {} });
    (LocalProvider.prototype.generate as jest.Mock).mockImplementation(generateMock);

    await gateway.generate({ prompt: 'test' });
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ targetModel: 'custom-normal:1b' }));
  });

  it('should pass through health check', async () => {
    const gateway = new ModelGateway();
    const healthMock = jest.fn().mockResolvedValue({ status: 'ok', message: 'Healthy' });
    (LocalProvider.prototype.checkHealth as jest.Mock).mockImplementation(healthMock);

    const res = await gateway.checkHealth();
    expect(res).toEqual({ status: 'ok', message: 'Healthy' });
    expect(healthMock).toHaveBeenCalled();
  });
});
