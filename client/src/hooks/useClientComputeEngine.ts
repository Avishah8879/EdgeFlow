import { useMemo } from "react";

export type ComputeMode = "webgpu" | "webgl2" | "cpu";

type ComputeResult = {
  mode: ComputeMode;
  output: Float32Array;
  durationMs: number;
  log: string;
};

function runCpuKernel(input: Float32Array): ComputeResult {
  console.info(`[Alpha Lab] Selecting CPU compute path for ${input.length} values`);
  const start = performance.now();
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    // Simple transform to prove work happened.
    output[i] = input[i] * 1.1 + 0.25;
  }
  const durationMs = performance.now() - start;
  return {
    mode: "cpu",
    output,
    durationMs,
    log: `[Alpha Lab] CPU fallback used; processed ${input.length} values in ${durationMs.toFixed(2)}ms`,
  };
}

let cachedAdapter: GPUAdapter | null = null;
let cachedDevice: GPUDevice | null = null;
let cachedPipeline: GPUComputePipeline | null = null;

async function getDevice(): Promise<GPUDevice> {
  if (cachedDevice) return cachedDevice;
  if (!("gpu" in navigator) || !navigator.gpu) {
    throw new Error("WebGPU not available");
  }
  cachedAdapter = cachedAdapter ?? (await navigator.gpu.requestAdapter());
  if (!cachedAdapter) {
    throw new Error("WebGPU adapter unavailable");
  }
  cachedDevice = await cachedAdapter.requestDevice();
  console.info(`[Alpha Lab] WebGPU device acquired: ${(cachedAdapter as unknown as { name?: string }).name ?? "unknown adapter"}`);
  return cachedDevice;
}

async function getPipeline(device: GPUDevice): Promise<GPUComputePipeline> {
  if (cachedPipeline) return cachedPipeline;
  const shaderModule = device.createShaderModule({
    code: `
      struct Buffer {
        data : array<f32>,
      };

      struct Params {
        length : u32,
      };

      @group(0) @binding(0) var<storage, read> inputBuffer : Buffer;
      @group(0) @binding(1) var<storage, read_write> outputBuffer : Buffer;
      @group(0) @binding(2) var<uniform> params : Params;

      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
        let idx = gid.x;
        if (idx < params.length) {
          outputBuffer.data[idx] = inputBuffer.data[idx] * 1.1 + 0.25;
        }
      }
    `,
  });

  cachedPipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: shaderModule, entryPoint: "main" },
  });
  return cachedPipeline;
}

async function runWebGPUKernel(input: Float32Array): Promise<ComputeResult> {
  console.info(`[Alpha Lab] Selecting WebGPU compute path for ${input.length} values`);
  const device = await getDevice();
  const pipeline = await getPipeline(device);

  const start = performance.now();
  const inputBuffer = device.createBuffer({
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputBuffer, 0, input as unknown as GPUAllowSharedBufferSource);

  const outputBuffer = device.createBuffer({
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const stagingBuffer = device.createBuffer({
    size: input.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const paramsBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([input.length]));

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inputBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
      { binding: 2, resource: { buffer: paramsBuffer } },
    ],
  });

  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(input.length / 64));
  pass.end();

  commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, input.byteLength);
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const copyArray = stagingBuffer.getMappedRange();
  const output = new Float32Array(copyArray.slice(0));
  stagingBuffer.unmap();

  const durationMs = performance.now() - start;
  return {
    mode: "webgpu",
    output,
    durationMs,
    log: `[Alpha Lab] WebGPU path used; processed ${input.length} values in ${durationMs.toFixed(
      2,
    )}ms`,
  };
}

function createWebGL2Context() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) {
    throw new Error("WebGL2 not available");
  }
  const extColorBufferFloat = gl.getExtension("EXT_color_buffer_float");
  if (!extColorBufferFloat) {
    throw new Error("EXT_color_buffer_float is unavailable");
  }
  return { gl, canvas };
}

function runWebGL2Kernel(input: Float32Array): ComputeResult {
  console.info(`[Alpha Lab] Selecting WebGL2 compute path for ${input.length} values`);
  const { gl } = createWebGL2Context();
  const length = input.length;
  const size = Math.ceil(Math.sqrt(length));
  const paddedLength = size * size;
  const padded = new Float32Array(paddedLength * 4);
  for (let i = 0; i < length; i += 1) {
    padded[i * 4] = input[i];
  }

  const start = performance.now();
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, padded);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const outputTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, outputTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, null);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);

  const vertex = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(
    vertex,
    `#version 300 es
    in vec2 position;
    out vec2 vUv;
    void main() {
      vUv = 0.5 * (position + 1.0);
      gl_Position = vec4(position, 0.0, 1.0);
    }`,
  );
  gl.compileShader(vertex);

  const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(
    fragment,
    `#version 300 es
    precision highp float;
    uniform sampler2D inputTexture;
    in vec2 vUv;
    out vec4 fragColor;
    void main() {
      vec4 sample = texture(inputTexture, vUv);
      fragColor = vec4(sample.r * 1.1 + 0.25, 0.0, 0.0, 1.0);
    }`,
  );
  gl.compileShader(fragment);

  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.useProgram(program);

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const positionLocation = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const samplerLocation = gl.getUniformLocation(program, "inputTexture");
  gl.uniform1i(samplerLocation, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const outData = new Float32Array(paddedLength * 4);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, outData);

  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = outData[i * 4]; // R channel
  }
  const durationMs = performance.now() - start;

  return {
    mode: "webgl2",
    output,
    durationMs,
    log: `[Alpha Lab] WebGL2 path used; processed ${input.length} values in ${durationMs.toFixed(2)}ms`,
  };
}

export function useClientComputeEngine() {
  const capability = useMemo<ComputeMode>(() => {
    if (typeof window === "undefined") return "cpu";
    if ("gpu" in navigator && navigator.gpu) {
      console.info("[Alpha Lab] Client capability detected: WebGPU");
      return "webgpu";
    }
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (gl) {
      console.info("[Alpha Lab] Client capability detected: WebGL2");
      return "webgl2";
    }
    console.info("[Alpha Lab] Client capability detected: CPU only");
    return "cpu";
  }, []);

  const runKernel = async (input: Float32Array): Promise<ComputeResult> => {
    try {
      if (capability === "webgpu") {
        return await runWebGPUKernel(input);
      }
      if (capability === "webgl2") {
        return runWebGL2Kernel(input);
      }
    } catch (err) {
      console.warn("[Alpha Lab] GPU path failed, falling back to CPU:", err);
    }
    return runCpuKernel(input);
  };

  return { mode: capability, runKernel };
}
