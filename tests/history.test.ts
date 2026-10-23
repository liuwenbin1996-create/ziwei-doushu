import { test } from "node:test";
import assert from "node:assert/strict";
import { readHistory, saveHistory } from "../lib/mobile/history";
import type { MobileRequest } from "../lib/mobile/chart";
const request: MobileRequest = {
  birth: { date: "1996-06-15", hour: 4, gender: "female", lateZi: false },
  year: 2026,
};
test("history round trips, removes duplicates, and limits storage to 20", () => {
  let entries = saveHistory([], request, "a", "2026-10-22T00:00:00Z");
  entries = saveHistory(
    entries,
    { ...request, year: 2027 },
    "b",
    "2026-10-22T00:00:00Z",
  );
  assert.equal(entries.length, 1);
  assert.equal(readHistory(JSON.stringify(entries))[0].request.year, 2027);
  for (let i = 0; i < 25; i++)
    entries = saveHistory(
      entries,
      {
        ...request,
        birth: {
          ...request.birth,
          date: "1990-01-" + String(i + 1).padStart(2, "0"),
        },
      },
      String(i),
      "2026-10-22T00:00:00Z",
    );
  assert.equal(entries.length, 20);
});
test("corrupt and invalid history never becomes chart input", () => {
  assert.deepEqual(readHistory(null), []);
  assert.throws(() => readHistory("{"));
  assert.throws(() => readHistory("{}"));
  assert.throws(() =>
    readHistory(JSON.stringify([{ id: "a", savedAt: "bad", request }])),
  );
  assert.throws(() =>
    readHistory(
      JSON.stringify([
        {
          id: "a",
          savedAt: "2026-01-01",
          request: {
            ...request,
            birth: { ...request.birth, date: "1996-02-30" },
          },
        },
      ]),
    ),
  );
});
