# Voice: design and trade-offs

## What is built
Browser voice on top of the same chat API (`src/ui/useVoice.ts`, used by the Live agent tab):

mic → browser speech recognition (Web Speech API) → `/api/chat` (real LLM + tools) → browser speech synthesis → speakers

Also: live interim transcript, a transcript of the whole call with tool calls, barge-in (opening the mic or detecting speech cancels the agent's voice), an Interrupt button, and an optional hands-free mode that re-opens the mic after each reply.

## Tuning the three voice layers
The job posting asks for tuning speech-to-text, the language model and text-to-speech. Each layer has its own knob here:

| Layer | What is tuned | Where |
|---|---|---|
| Text-to-speech | Picks the highest-ranked English voice on the device (premium/natural voices first, novelty and non-English voices excluded) with a picker and speed control; speaks sentence by sentence; rewrites text for speech (prices as words, confirmation codes and phone numbers digit by digit, times, ISO dates, markdown removed) | `src/ui/speech.ts`, `src/ui/useVoice.ts` (tested in `tests/speech.test.ts`) |
| Language model | A "phone-call style" instruction (1–3 short sentences, no lists or symbols, one question at a time) and a lower token cap, for both agents equally, per conversation | `server/prompts.ts` (`VOICE_STYLE`), `channel: 'voice'` in the API (tested in `tests/api.test.ts`) |
| Speech-to-text | Browser recognition with interim results, barge-in and optional hands-free re-listening; not otherwise tuned | `src/ui/useVoice.ts` |

Not verified: how any of it *sounds*. Tests cover the text rewriting, ranking and API behavior; nobody has listened to the result with a microphone and speakers. Voice quality depends on the voices installed on the visitor's device. The next step up is a hosted neural voice service, which needs its own account and key and has not been added. The recorded evaluation used normal text replies, not phone-call style.

## Status: implemented, NOT verified end to end
Automated checks here cannot grant microphone permission or hear audio. The voice path has been compiled and type-checked, and the text path it feeds is tested against the real model, but **nobody has yet confirmed a spoken conversation works**. To verify: open the live site in Chrome, allow the mic, press Speak, say "Hi, I'd like to book a cleaning Thursday at 10am".

Privacy note: in Chrome, Web Speech recognition sends audio to Google's service. The app itself records and stores no audio.

## Pipeline (STT → LLM → TTS) vs realtime speech-to-speech
Assessed from vendor documentation and general knowledge; **not benchmarked here**.

| | STT → LLM → TTS (chosen) | Realtime speech-to-speech |
|---|---|---|
| Model | Any text LLM. The A/B comparison uses the same Claude model and tools as the text evaluation | Tied to vendors offering audio-native models; a different model than the one evaluated here |
| Evaluability | Exact transcripts and tool traces at every step; the existing evaluation applies unchanged | Transcripts are secondary output; tool behavior can differ from text models; evaluation would need rebuilding |
| Latency | Sum of recognition end-of-speech, LLM round trips (measured 2–4 s per turn here, tool calls included) and TTS start. Noticeable pauses | Typically lower, with more natural overlap and prosody |
| Turn-taking / interruption | Crude: browser end-of-speech detection plus our barge-in cancel | Native voice-activity handling and mid-sentence interruption |
| Infrastructure | None beyond the existing API; works in a browser tab | Realtime WebSocket/WebRTC sessions, extra vendor account and key, higher per-minute cost |
| Control | Full control of prompts, tools, guardrails and logging | Less visibility into intermediate reasoning |

Why STT → LLM → TTS for v1: it keeps the evaluated agent identical to the voice agent, needs no new vendor, and every turn stays inspectable. A realtime model is the right next experiment for latency and interruptions, but it needs its own key and its own evaluation, so it is not implemented.

## Not covered
No telephone number or telephony latency. Regal's own documentation states that simulations cannot test voice quality, interruption handling, transfers or telephony latency; those need real calls. The same applies to this project.
