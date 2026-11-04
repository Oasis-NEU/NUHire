# ATS: approach and resume text (OAS-234)

**Decision: build keyword matching first.** It scores a resume against the job
description a group is reading, gives the same answer every time, and can show
students exactly which terms matched and which were missing. HackerRank's
open-source tool is not adopted. An AI model stays a later option for explaining
a score, not for producing one, and was not tested this cycle because there is
no Khoury API key yet.

Every approach needs the text, so this PR also extracts and stores it: see
[Resume text](#resume-text).

## What the classroom needs

NUHire runs live, with one professor and about 30 students. So an ATS score has
to be:

- **the same for every group**: two groups looking at one resume see one score
- **explainable**: the point is to teach students what a screen looks for
- **against the job description**: groups hire for different roles
- **free and local per class**: no key, quota or outside service that can fail
  mid-class, and no resume sent to a third party

## The three options

|                       | Keyword matching          | HackerRank `hiring-agent`           | AI model (Khoury key)        |
| --------------------- | ------------------------- | ----------------------------------- | ---------------------------- |
| Scores against the JD | yes                       | no: a fixed rubric per role         | yes, if prompted to          |
| Same score every run  | yes                       | no (see below)                      | no, unless pinned and cached |
| Shows why             | matched and missing terms | LLM-written evidence per category   | LLM-written explanation      |
| Runs in our stack     | TypeScript, in the API    | Python 3.11 CLI, a second runtime   | HTTP call from the API       |
| Needs                 | nothing                   | an LLM (Ollama, Gemini or OpenAI)   | a key and network            |
| Sends resume data out | no                        | to the LLM, plus GitHub API lookups | to the provider              |
| Tested                | not yet built             | read its README, not run            | no key this cycle            |

**HackerRank's tool exists:** it is
[interviewstreet/hiring-agent](https://github.com/interviewstreet/hiring-agent),
MIT licensed (© HackerRank). MIT lets us use, copy, modify and redistribute it,
commercially or not, provided we keep the copyright and licence notice. The
licence is not the problem; the fit is:

- its own README says it is "Not an ATS" and ships a demo config, not the one
  HackerRank uses
- it takes a resume and a role name, not a job description
- it scores the candidate's GitHub profile from the API. Four of our ten sample
  resumes list a GitHub URL, and the candidates are fictional, so it would be
  scoring whoever owns those usernames, if anyone
- an LLM produces the score. One reviewer ran the same resume 100 times with
  its default local model and got scores from 66 to 99
  ([Dan Unparsed](https://danunparsed.com/p/hackerrank-open-source-ats)). In a
  class, that is two groups seeing different scores for the same resume.

Its rubric ideas (category weights, evidence per category) are worth borrowing
for how we present a score. If we copy any of its text, the MIT notice comes
with it.

**AI model:** worth revisiting once there is a Khoury key, as an "explain this
score" button on top of keyword matching. That keeps the score deterministic
and the AI optional, so a quota or outage costs an explanation, not a class.
Ask Khoury IT for the key now; it is the slow part.

## Resume text

- **Library: [unpdf](https://github.com/unjs/unpdf) 1.9.1** (MIT). It wraps
  pdf.js, the engine `react-pdf` already uses on the frontend, so this is not a
  second PDF engine. All three candidates read all 15 bundled PDFs; unpdf is
  2.5 MB against about 60 MB for `pdf-parse` and `pdfjs-dist`, needs no native
  canvas binary, and 1.9 still ships CommonJS, which the API is. Its bundled
  pdf.js has no `eval` or `new Function` path, the route behind CVE-2024-4367.
- **Where:** `Resume_pdfs.extracted_text` and `job_descriptions.extracted_text`,
  added by migration `008`. Text is stored when a row is created
  (`createResumePdf`, `createJob`, class creation) and backfilled at every API
  start for any row without it.
- **NULL means not extracted yet**, and is retried at the next start. A scanned
  PDF with no text layer stores `''`, which keyword matching scores as nothing
  found; OCR is out of scope.
- **Production risk:** uploads have no volume, so a professor's PDFs are lost on
  each deploy and their rows can never get text. The backfill logs how many.
  The fix is already a ticket (uploads volume, `TICKETS.md`).

## Next

1. Request the Khoury API key.
2. Keyword matching over `extracted_text`: a term list from the job
   description, a score per resume, and the matched and missing terms.
3. Mount the uploads volume, so every PDF row can keep its text.
