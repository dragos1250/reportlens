<div align="center">

# 🔍 ReportLens 🔍

### Read annual reports with an AI assistant that explains and **cites** everything

*Select any paragraph, table or number in a report, ask a question, and get an answer that points to the exact page it came from.*

![Status](https://img.shields.io/badge/status-in%20development-orange?style=for-the-badge)
![Java](https://img.shields.io/badge/Java-Spring%20Boot-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![Python](https://img.shields.io/badge/Python-FastAPI-3776AB?style=for-the-badge&logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-Tailwind-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge)

[🎬 Demo video](#-demo) · [🚀 Live demo](#-demo) · [🏗️ Architecture](#%EF%B8%8F-architecture) · [🗺️ Roadmap](#%EF%B8%8F-roadmap)

</div>

---

## ✨ What is ReportLens?

Annual reports are long, dense and full of tables. **ReportLens** is a report viewer with an AI assistant built next to it: the PDF is on the left, the assistant is on the right, and every answer links back to the page and passage it is based on.

It is built as a **Retrieval-Augmented Generation (RAG)** system, so the assistant answers only from the documents you load, and says **"I couldn't find this in the report"** instead of guessing.

> 📌 This is a personal portfolio project, tested on publicly available telecom annual reports. It is not affiliated with any company.

## 🎯 Features

- 📄 **Report viewer with an AI side panel**: read the PDF and ask questions in the same screen
- 🖍️ **Select & explain**: highlight a paragraph or table and press *Explain this* for a plain-language explanation
- 📌 **Verifiable citations**: every answer links to the page, with the source passage highlighted
- 🔎 **Hybrid search**: semantic search (embeddings) combined with keyword search (BM25) and re-ranking, so numbers and names are found reliably
- 🚫 **"Not in the report" mode**: the assistant refuses to answer when there is no supporting source
- 🆚 **Compare reports**: ask how something changed between two years
- 🌍 **Ask in Romanian or English**: multilingual embeddings, documents in English
- 📊 **Built-in evaluation page**: a test set of questions with measured retrieval and answer quality

## 🎬 Demo

| | |
|---|---|
| 🎥 **Video (60–90 s)** | _link coming soon_ |
| 🌐 **Live demo** | _link coming soon_ |
| 🖼️ **Screenshots** | _coming soon_ |

<!-- Replace with a GIF once the UI exists: ![ReportLens demo](docs/demo.gif) -->

## 🏗️ Architecture

```mermaid
flowchart LR
    U[👤 User] --> F[⚛️ React + Tailwind<br/>PDF viewer & chat]
    F --> B[☕ Spring Boot API<br/>conversations, documents, feedback]
    B --> A[🐍 FastAPI AI service<br/>retrieval & generation]
    A --> D[(🐘 PostgreSQL + pgvector)]
    B --> D
    A --> L[🤖 LLM API]
```

**How a question is answered**

1. 📥 **Ingestion**: PDFs are split into page-aware chunks, embedded, and stored in pgvector
2. 🔎 **Retrieval**: hybrid search (semantic + BM25), then re-ranking
3. 🧠 **Generation**: the language model answers using only the retrieved passages
4. 📌 **Citation**: the answer is returned with document, page and passage references
5. 🚫 **Guardrail**: if nothing relevant is found, the assistant says so

## 🧰 Tech stack

| Layer | Technology |
|---|---|
| 🖥️ Frontend | React, Tailwind CSS, pdf.js |
| ☕ Backend | Java, Spring Boot |
| 🐍 AI service | Python, FastAPI, sentence-transformers |
| 🗄️ Database | PostgreSQL + pgvector |
| 🐳 DevOps | Docker, Docker Compose |

## 🚀 Getting started

> ⚠️ The project is under active development. These steps will be finalised as the pieces land.

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/reportlens.git
cd reportlens

# 2. Configure environment variables
cp .env.example .env
# add your LLM API key to .env  (never commit this file!)

# 3. Download the public reports used for testing
./scripts/download_reports.sh

# 4. Start everything
docker compose up --build
```

Then open **http://localhost:3000** 🎉

## 📏 Evaluation

Quality is measured, not assumed. A hand-written test set of questions with expected source pages is used to track:

| Metric | Result |
|---|---|
| 🎯 Retrieval recall@5 | _to be measured_ |
| ✅ Answer faithfulness to source | _to be measured_ |
| 🚫 Correct refusals on out-of-scope questions | _to be measured_ |

## 🗺️ Roadmap

- [x] 🎬 Project setup and repository
- [ ] 📥 PDF ingestion and chunking with page metadata
- [ ] 💬 Question answering with citations (CLI prototype)
- [ ] 🔎 Hybrid search and re-ranking
- [ ] 🚫 "Not in the report" guardrail
- [ ] ☕ Spring Boot API and database
- [ ] ⚛️ React UI with PDF viewer and highlighted citations
- [ ] 🖍️ Select & explain
- [ ] 🆚 Compare two reports
- [ ] 📏 Evaluation page and test set
- [ ] 🚢 Docker Compose and public demo

## 📂 Project structure

```text
reportlens/
├── frontend/       # React app (viewer + chat)
├── backend/        # Spring Boot API
├── ai-service/     # FastAPI: ingestion, retrieval, generation
├── eval/           # test questions and evaluation scripts
├── scripts/        # helper scripts (download reports, etc.)
└── docker-compose.yml
```

## ⚠️ Notes

- 📚 Reports are **not stored in this repository**; a script downloads them from their official public sources.
- 🔑 API keys live only in environment variables on the server, never in the frontend or the repo.
- 🤖 The assistant can make mistakes: always check the cited page.

## 📜 License

Released under the [MIT License](LICENSE).

## 👤 Author

**Dragoș-Mihai Răducanu**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white)](https://github.com/<your-username>)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/<your-profile>)

---

<div align="center">

⭐ If you find this project interesting, feel free to star it!

</div>
