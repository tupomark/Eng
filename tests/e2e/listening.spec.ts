import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function sampleReady(page: Page) {
  await page.goto("/listening");
  await expect(
    page.getByRole("heading", { name: "A quiet coast", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => {
    const player = document.querySelector("audio");
    return !!player && Number.isFinite(player.duration) && player.duration > 3;
  });
}
async function readSession(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        position: number;
        repeatEnabled: boolean;
        transcriptRevealedAt?: string;
      }>((resolve) => {
        const request = indexedDB.open("lexis.media.local.v1", 1);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("sessions", "readonly");
          const get = transaction
            .objectStore("sessions")
            .get("session:lexis-original-coast-v1");
          get.onsuccess = () =>
            resolve(get.result ?? { position: 0, repeatEnabled: false });
          transaction.oncomplete = () => db.close();
        };
      }),
  );
}

test("real audio plays, seeks, changes speed, repeats and restores its paused position", async ({
  page,
}) => {
  await sampleReady(page);
  await page
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await page.waitForFunction(
    () => (document.querySelector("audio")?.currentTime ?? 0) > 1,
  );
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await expect
    .poll(async () => (await readSession(page)).position)
    .toBeGreaterThan(0.8);
  const saved = (await readSession(page)).position;
  await page.reload();
  await page.waitForFunction((position) => {
    const player = document.querySelector("audio");
    return !!player && player.currentTime >= position - 0.2 && player.paused;
  }, saved);
  await page
    .getByRole("combobox", { name: "Playback speed", exact: true })
    .selectOption("0.75");
  await expect
    .poll(() =>
      page
        .locator("audio")
        .first()
        .evaluate((player) => (player as HTMLAudioElement).playbackRate),
    )
    .toBe(0.75);
  await page.getByText("A–B repeat", { exact: true }).click();
  await page.getByLabel("A (seconds)", { exact: true }).fill("0.2");
  await page.getByLabel("B (seconds)", { exact: true }).fill("1.2");
  await page
    .getByRole("button", { name: "Enable A–B repeat", exact: true })
    .click();
  await expect
    .poll(async () => (await readSession(page)).repeatEnabled)
    .toBe(true);
  await page
    .getByRole("button", { name: "Replay fragment", exact: true })
    .click();
  await page.waitForFunction(() => {
    const player = document.querySelector("audio");
    return !!player && !player.paused && player.currentTime > 0.3;
  });
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  expect(
    await page
      .locator("audio")
      .first()
      .evaluate((player) => (player as HTMLAudioElement).currentTime),
  ).toBeLessThan(1.6);
});

test("hidden and revealed transcript attempts record different assistance through the shared task engine", async ({
  page,
}) => {
  await sampleReady(page);
  await page
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start listening check", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start listening check", exact: true })
    .click();
  await page.getByRole("radio", { name: "by the sea", exact: true }).check();
  await page
    .getByRole("button", { name: "Check listening answer", exact: true })
    .click();
  await expect(
    page.getByText("Your answer fits this recording.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reveal first part", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hide transcript", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start listening check", exact: true })
    .click();
  await page.getByRole("radio", { name: "by the sea", exact: true }).check();
  await page
    .getByRole("button", { name: "Check listening answer", exact: true })
    .click();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.tasks.v1")!),
  );
  expect(state.attempts).toHaveLength(2);
  expect(state.attempts[0].evaluation.outcome).toBe("accepted");
  expect(state.attempts[0].assistance.transcriptRevealedAt).toBeUndefined();
  expect(state.attempts[1].assistance.transcriptRevealedAt).toBeTruthy();
  expect(
    state.tasks.every((task: { skill: string }) => task.skill === "listening"),
  ).toBe(true);
});

test("a permitted local WAV persists privately and a disguised audio file cannot replace it", async ({
  page,
}) => {
  await sampleReady(page);
  await page
    .getByLabel("Choose audio or video", { exact: true })
    .setInputFiles(resolve("public/audio/lexis-coast.wav"));
  await page
    .getByRole("checkbox", { name: /I am allowed to use this file/u })
    .check();
  await page
    .getByRole("button", { name: "Save media on this device", exact: true })
    .click();
  await expect(page).toHaveURL(/source=media-/u);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "lexis-coast", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Choose audio or video", { exact: true })
    .setInputFiles({
      name: "not-a-recording.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("This is text, not audio."),
    });
  await page
    .getByRole("checkbox", { name: /I am allowed to use this file/u })
    .check();
  await page
    .getByRole("button", { name: "Save media on this device", exact: true })
    .click();
  await expect(
    page.getByRole("alert", { name: "Listening error", exact: true }),
  ).toContainText("not a supported");
  await expect(
    page.getByRole("heading", { name: "lexis-coast", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Delete this media & transcript",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/listening$/u);
});

test("a cancelled microphone permission request releases a late-granted real media track", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const destination = new AudioContext().createMediaStreamDestination();
    const target = window as unknown as {
      grantMic?: () => void;
      micTrack?: MediaStreamTrack;
    };
    target.micTrack = destination.stream.getAudioTracks()[0];
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        target.grantMic = () => resolve(destination.stream);
      });
  });
  await sampleReady(page);
  await page
    .getByRole("checkbox", { name: /Allow microphone capture/u })
    .check();
  await page
    .getByRole("button", { name: "Record my repeat", exact: true })
    .click();
  await expect(
    page.getByText(/Waiting for microphone permission/u),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel recording", exact: true })
    .click();
  await page.evaluate(() =>
    (window as unknown as { grantMic: () => void }).grantMic(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { micTrack: MediaStreamTrack }).micTrack
            .readyState,
      ),
    )
    .toBe("ended");
  await expect(
    page.getByText("Microphone is off.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.tasks.v1")),
  ).toBeNull();
});

test("local profile removal stops playback and discards a microphone permission result", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const destination = new AudioContext().createMediaStreamDestination();
    const target = window as unknown as {
      grantMic: () => void;
      micTrack: MediaStreamTrack;
    };
    target.micTrack = destination.stream.getAudioTracks()[0];
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        target.grantMic = () => resolve(destination.stream);
      });
  });
  await sampleReady(page);
  await page
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Allow microphone capture/u })
    .check();
  await page
    .getByRole("button", { name: "Record my repeat", exact: true })
    .click();
  await expect(
    page.getByText(/Waiting for microphone permission/u),
  ).toBeVisible();
  await page.evaluate(async () => {
    localStorage.setItem("lexis.local-purge.v1", "test-removal");
    const pending: Promise<unknown>[] = [];
    window.dispatchEvent(
      new CustomEvent("lexis-local-purge", {
        detail: {
          register: (promise: Promise<unknown>) => pending.push(promise),
        },
      }),
    );
    await Promise.all(pending);
    (window as unknown as { grantMic: () => void }).grantMic();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { micTrack: MediaStreamTrack }).micTrack
            .readyState,
      ),
    )
    .toBe("ended");
  await expect(
    page.getByRole("button", { name: "Play recording", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("alert", { name: "Listening error", exact: true }),
  ).toContainText("paused for deletion");
  await expect(page.locator("audio")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.tasks.v1")),
  ).toBeNull();
});

test("a pending media import cannot recreate data after profile removal", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const target = window as unknown as {
      finishDigest: () => void;
      digestPending: boolean;
    };
    crypto.subtle.digest = async (...args) => {
      const result = await digest(...args);
      target.digestPending = true;
      return new Promise((resolve) => {
        target.finishDigest = () => resolve(result);
      });
    };
  });
  await sampleReady(page);
  await page
    .getByLabel("Choose audio or video", { exact: true })
    .setInputFiles(resolve("public/audio/lexis-coast.wav"));
  await page
    .getByRole("checkbox", { name: /I am allowed to use this file/u })
    .check();
  await page
    .getByRole("button", { name: "Save media on this device", exact: true })
    .click();
  await page.waitForFunction(
    () => (window as unknown as { digestPending: boolean }).digestPending,
  );
  await page.evaluate(async () => {
    localStorage.setItem("lexis.local-purge.v1", "test-removal");
    const pending: Promise<unknown>[] = [];
    window.dispatchEvent(
      new CustomEvent("lexis-local-purge", {
        detail: {
          register: (promise: Promise<unknown>) => pending.push(promise),
        },
      }),
    );
    await Promise.all(pending);
    await new Promise<void>((resolve, reject) => {
      const removal = indexedDB.deleteDatabase("lexis.media.local.v1");
      removal.onsuccess = () => resolve();
      removal.onerror = () => reject(new Error("Media fixture removal failed"));
      removal.onblocked = () =>
        reject(new Error("Media fixture removal is blocked"));
    });
    (window as unknown as { finishDigest: () => void }).finishDigest();
  });
  await expect(
    page.getByRole("alert", { name: "Listening error", exact: true }),
  ).toContainText("paused for deletion");
  await expect(page).toHaveURL(/\/listening$/u);
  await expect(page.locator("audio")).toHaveCount(0);
  // A late imported file is neither re-opened nor acknowledged as saved.
  await expect(
    page.getByText(
      "Media saved privately in this browser. No file was uploaded.",
      { exact: true },
    ),
  ).toHaveCount(0);
});
