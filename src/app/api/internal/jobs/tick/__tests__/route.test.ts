import { beforeEach, describe, expect, it, vi } from "vitest";

const getJobRunnerSecret = vi.fn();
const runDueJobs = vi.fn();
const registerPipelineHandlers = vi.fn();
const callOrder: string[] = [];

vi.mock("@/lib/env/server", () => ({
  getJobRunnerSecret: () => getJobRunnerSecret(),
}));

vi.mock("@/features/processing/services/job-runner", () => ({
  runDueJobs: (...args: unknown[]) => {
    callOrder.push("runDueJobs");
    return runDueJobs(...args);
  },
}));

vi.mock("@/features/intelligence/services/register-pipeline-handlers", () => ({
  registerPipelineHandlers: () => {
    callOrder.push("registerPipelineHandlers");
    return registerPipelineHandlers();
  },
}));

// Avoid pulling next/server's after into the unit test path.
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

const { POST } = await import("@/app/api/internal/jobs/tick/route");

function request(secret: string | null) {
  const headers = new Headers();
  if (secret !== null) headers.set("x-job-runner-secret", secret);
  return new Request("http://localhost/api/internal/jobs/tick", {
    method: "POST",
    headers,
  });
}

describe("POST /api/internal/jobs/tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    getJobRunnerSecret.mockReturnValue("the-real-secret");
  });

  it("returns 401 and does not run jobs when the secret is wrong", async () => {
    const response = await POST(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(runDueJobs).not.toHaveBeenCalled();
  });

  it("returns 401 when the header is missing", async () => {
    const response = await POST(request(null));

    expect(response.status).toBe(401);
    expect(runDueJobs).not.toHaveBeenCalled();
  });

  it("runs jobs when the secret matches", async () => {
    runDueJobs.mockResolvedValue({ ran: 3 });

    const response = await POST(request("the-real-secret"));

    expect(runDueJobs).toHaveBeenCalledWith(45_000);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ran: 3 });
  });

  it("registers pipeline handlers before running jobs", async () => {
    runDueJobs.mockResolvedValue({ ran: 0 });

    await POST(request("the-real-secret"));

    expect(registerPipelineHandlers).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["registerPipelineHandlers", "runDueJobs"]);
  });

  it("does not register handlers when the secret is wrong", async () => {
    await POST(request("wrong-secret"));

    expect(registerPipelineHandlers).not.toHaveBeenCalled();
  });
});
