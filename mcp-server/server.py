#!/usr/bin/env python3
"""
video-moment MCP Server
Vbot이 비모 대시보드 데이터에 접근할 수 있도록 하는 MCP 서버

환경변수:
    SUPABASE_URL               : Supabase 프로젝트 URL
    SUPABASE_SERVICE_ROLE_KEY  : service_role 키 (RLS 우회, Supabase 대시보드 > Settings > API)
"""

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from supabase import create_client, Client


# ── Supabase 초기화 ──────────────────────────────────────────────────────────

def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다\n"
            "Supabase 대시보드 > Settings > API > service_role 키를 사용하세요."
        )
    return create_client(url, key)


# ── 헬퍼 ────────────────────────────────────────────────────────────────────

def fmt(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)

def today_kst() -> datetime:
    return datetime.now(timezone(timedelta(hours=9)))


# ── MCP 서버 정의 ────────────────────────────────────────────────────────────

server = Server("video-moment")


@server.list_tools()
async def handle_list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_summary",
            description=(
                "비모 대시보드 전체 현황 요약을 가져옵니다. "
                "진행중 프로젝트 수, 에피소드 현황, 이번달 매니징 수익, "
                "마감 임박 에피소드 등을 한눈에 확인할 수 있습니다. "
                "매일 아침 보고나 슬랙 요약 메시지에 활용하세요."
            ),
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="list_projects",
            description=(
                "프로젝트 목록을 가져옵니다. "
                "status로 필터 가능: planning(기획중), in_progress(진행중), "
                "completed(완료), on_hold(보류). 생략하면 전체 조회."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "필터할 프로젝트 상태",
                        "enum": ["planning", "in_progress", "completed", "on_hold"],
                    }
                },
            },
        ),
        Tool(
            name="get_project",
            description=(
                "특정 프로젝트의 상세 정보와 해당 프로젝트에 속한 "
                "에피소드(회차) 목록을 함께 가져옵니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "string",
                        "description": "프로젝트 ID (UUID 형식)",
                    }
                },
                "required": ["project_id"],
            },
        ),
        Tool(
            name="list_episodes",
            description=(
                "에피소드(회차) 목록을 가져옵니다. "
                "status, 담당 파트너 ID, 프로젝트 ID로 필터 가능. "
                "status: waiting(대기), in_progress(진행중), review(검토중), completed(완료)"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "에피소드 상태 필터",
                        "enum": ["waiting", "in_progress", "review", "completed"],
                    },
                    "assignee_id": {
                        "type": "string",
                        "description": "담당 파트너의 ID",
                    },
                    "project_id": {
                        "type": "string",
                        "description": "특정 프로젝트 ID로 필터",
                    },
                },
            },
        ),
        Tool(
            name="get_upcoming_deadlines",
            description=(
                "마감 임박 에피소드 목록을 가져옵니다. "
                "완료되지 않은 에피소드 중 오늘부터 N일 이내에 마감인 항목을 반환합니다. "
                "기본값은 7일."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "몇 일 이내 마감인 에피소드를 조회할지 (기본: 7)",
                    }
                },
            },
        ),
        Tool(
            name="list_partners",
            description=(
                "파트너 목록을 가져옵니다. "
                "status로 필터 가능: active(활성), inactive(비활성). 생략하면 전체."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "파트너 활성 상태 필터",
                        "enum": ["active", "inactive"],
                    }
                },
            },
        ),
        Tool(
            name="list_clients",
            description=(
                "클라이언트 목록을 가져옵니다. "
                "status로 필터 가능: active, inactive. 생략하면 전체."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "클라이언트 활성 상태 필터",
                        "enum": ["active", "inactive"],
                    }
                },
            },
        ),
        Tool(
            name="update_project_status",
            description=(
                "프로젝트 상태를 변경합니다. "
                "completed로 변경 시 completed_at 타임스탬프가 자동 기록됩니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "string",
                        "description": "변경할 프로젝트 ID",
                    },
                    "status": {
                        "type": "string",
                        "description": "새로운 상태",
                        "enum": ["planning", "in_progress", "completed", "on_hold"],
                    },
                },
                "required": ["project_id", "status"],
            },
        ),
        Tool(
            name="update_episode_status",
            description=(
                "에피소드(회차) 상태를 변경합니다. "
                "파트너가 납품 완료했을 때, 검토 중일 때 등 상태 업데이트에 사용하세요."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "episode_id": {
                        "type": "string",
                        "description": "변경할 에피소드 ID",
                    },
                    "status": {
                        "type": "string",
                        "description": "새로운 상태",
                        "enum": ["waiting", "in_progress", "review", "completed"],
                    },
                },
                "required": ["episode_id", "status"],
            },
        ),
        Tool(
            name="list_portfolio",
            description=(
                "포트폴리오 목록을 가져옵니다. "
                "published_only=true로 공개된 항목만 필터할 수 있습니다. "
                "생략하면 전체(공개+비공개) 조회."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "published_only": {
                        "type": "boolean",
                        "description": "true이면 공개된 포트폴리오만 반환",
                    }
                },
            },
        ),
        Tool(
            name="add_portfolio_item",
            description=(
                "새 포트폴리오 항목을 추가합니다. "
                "title, client, youtube_url은 필수입니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "포트폴리오 제목",
                    },
                    "client": {
                        "type": "string",
                        "description": "클라이언트 이름",
                    },
                    "youtube_url": {
                        "type": "string",
                        "description": "유튜브 영상 URL",
                    },
                    "description": {
                        "type": "string",
                        "description": "포트폴리오 설명 (선택)",
                    },
                    "completed_at": {
                        "type": "string",
                        "description": "완료일 (YYYY-MM-DD, 선택)",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "태그 목록 (선택)",
                    },
                    "is_published": {
                        "type": "boolean",
                        "description": "즉시 공개 여부 (기본: false)",
                    },
                },
                "required": ["title", "client", "youtube_url"],
            },
        ),
        Tool(
            name="toggle_portfolio_published",
            description=(
                "포트폴리오 항목의 공개/비공개 상태를 전환합니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "포트폴리오 항목 ID (UUID)",
                    },
                    "is_published": {
                        "type": "boolean",
                        "description": "true=공개, false=비공개",
                    },
                },
                "required": ["id", "is_published"],
            },
        ),
        Tool(
            name="get_marketing_stats",
            description=(
                "마케팅 현황 요약을 가져옵니다. "
                "포트폴리오 공개/비공개 수, 클라이언트별 완료 프로젝트 수를 반환합니다."
            ),
            inputSchema={"type": "object", "properties": {}},
        ),
        # ── 삭제 ──
        Tool(
            name="delete_episode",
            description="에피소드를 삭제합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "episode_id": {"type": "string", "description": "삭제할 에피소드 ID"},
                },
                "required": ["episode_id"],
            },
        ),
        Tool(
            name="delete_project",
            description="프로젝트를 삭제합니다. 하위 에피소드도 함께 삭제됩니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "삭제할 프로젝트 ID"},
                },
                "required": ["project_id"],
            },
        ),
        # ── 파트너/클라이언트 CRUD ──
        Tool(
            name="create_partner",
            description="새 파트너를 등록합니다. name은 필수.",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "company": {"type": "string"},
                    "partner_type": {"type": "string"},
                    "role": {"type": "string"},
                    "status": {"type": "string", "enum": ["active", "inactive"]},
                    "bank": {"type": "string"},
                    "bank_account": {"type": "string"},
                    "position": {"type": "string"},
                    "job_title": {"type": "string"},
                },
                "required": ["name"],
            },
        ),
        Tool(
            name="update_partner",
            description="파트너 정보를 수정합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "partner_id": {"type": "string", "description": "파트너 ID"},
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "company": {"type": "string"},
                    "partner_type": {"type": "string"},
                    "role": {"type": "string"},
                    "status": {"type": "string", "enum": ["active", "inactive"]},
                    "bank": {"type": "string"},
                    "bank_account": {"type": "string"},
                    "position": {"type": "string"},
                    "job_title": {"type": "string"},
                },
                "required": ["partner_id"],
            },
        ),
        Tool(
            name="create_client",
            description="새 클라이언트를 등록합니다. name은 필수.",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "contact_person": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "company": {"type": "string"},
                    "address": {"type": "string"},
                    "status": {"type": "string", "enum": ["active", "inactive"]},
                    "notes": {"type": "string"},
                },
                "required": ["name"],
            },
        ),
        Tool(
            name="update_client",
            description="클라이언트 정보를 수정합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "description": "클라이언트 ID"},
                    "name": {"type": "string"},
                    "contact_person": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "company": {"type": "string"},
                    "address": {"type": "string"},
                    "status": {"type": "string", "enum": ["active", "inactive"]},
                    "notes": {"type": "string"},
                },
                "required": ["client_id"],
            },
        ),
        # ── work_steps 개별 수정 ──
        Tool(
            name="update_work_step",
            description=(
                "에피소드의 work_steps에서 특정 스텝의 필드(label, status, 날짜 등)를 개별 수정합니다. "
                "work_type(롱폼 등)과 step_id로 스텝을 찾아 업데이트합니다. "
                "주의: 이 도구는 기존 스텝의 필드 변경만 가능합니다. "
                "스텝 추가/삭제/개수 변경이 필요하면 update_episode로 work_steps 전체를 교체하세요."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "episode_id": {"type": "string", "description": "에피소드 ID"},
                    "work_type": {"type": "string", "description": "작업 유형 키 (롱폼, 본편 숏폼 등)"},
                    "step_id": {"type": "string", "description": "수정할 스텝의 id"},
                    "label": {"type": "string", "description": "스텝 이름 (예: 1차 가편 → 1차 종편)"},
                    "category": {"type": "string"},
                    "status": {"type": "string", "enum": ["waiting", "in_progress", "completed"]},
                    "startDate": {"type": "string", "description": "시작일 (YYYY-MM-DD)"},
                    "dueDate": {"type": "string", "description": "마감일 (YYYY-MM-DD)"},
                    "assigneeId": {"type": "string"},
                },
                "required": ["episode_id", "work_type", "step_id"],
            },
        ),
        # ── 검색/조회 ──
        Tool(
            name="search_episodes",
            description="에피소드를 제목이나 키워드로 검색합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "검색 키워드 (제목에서 검색)"},
                    "project_id": {"type": "string", "description": "프로젝트 ID 필터 (선택)"},
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="get_partner_payment_summary",
            description=(
                "파트너별 정산 요약을 조회합니다. "
                "특정 파트너의 전체 에피소드 중 미정산/정산완료 건수와 금액을 반환합니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "partner_id": {"type": "string", "description": "파트너 ID (선택, 없으면 전체)"},
                },
            },
        ),
        Tool(
            name="get_project_financials",
            description=(
                "프로젝트별 매출/비용/수익 집계를 조회합니다. "
                "프로젝트의 총액, 파트너 지급액, 매니징 수익, 마진율을 계산합니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "프로젝트 ID (선택, 없으면 전체)"},
                },
            },
        ),
        # ── 일괄 처리 ──
        Tool(
            name="batch_update_payments",
            description=(
                "여러 에피소드의 정산 상태를 일괄 변경합니다. "
                "episode_ids 배열에 있는 모든 에피소드의 payment_status를 변경합니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "episode_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "에피소드 ID 목록",
                    },
                    "payment_status": {"type": "string", "enum": ["pending", "completed"]},
                    "invoice_status": {"type": "string", "enum": ["pending", "completed"]},
                    "invoice_date": {"type": "string"},
                },
                "required": ["episode_ids"],
            },
        ),
        Tool(
            name="duplicate_episode",
            description=(
                "기존 에피소드를 복제하여 새 에피소드를 생성합니다. "
                "work_steps 구조를 그대로 복사하고, 상태는 초기화됩니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "source_episode_id": {"type": "string", "description": "복제할 원본 에피소드 ID"},
                    "new_episode_number": {"type": "integer", "description": "새 에피소드 번호"},
                    "new_title": {"type": "string", "description": "새 제목 (선택, 없으면 원본 + ' (복제)')"},
                },
                "required": ["source_episode_id", "new_episode_number"],
            },
        ),
        # ── 기존 도구 ──
        Tool(
            name="create_project",
            description=(
                "새 프로젝트를 생성합니다. "
                "title은 필수이고, client, status, total_amount, partner_payment, "
                "management_fee, category, channels, work_content 등을 지정할 수 있습니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "프로젝트 제목"},
                    "client": {"type": "string", "description": "클라이언트 이름"},
                    "client_id": {"type": "string", "description": "클라이언트 UUID"},
                    "status": {"type": "string", "enum": ["planning", "in_progress", "completed", "on_hold"]},
                    "category": {"type": "string", "description": "카테고리 (유튜브, 광고 등)"},
                    "channels": {"type": "array", "items": {"type": "string"}},
                    "work_content": {"type": "array", "items": {"type": "string"}, "description": "작업 유형 (롱폼, 기획 숏폼, 본편 숏폼, 썸네일)"},
                    "total_amount": {"type": "number", "description": "총 금액"},
                    "partner_payment": {"type": "number", "description": "파트너 지급액"},
                    "management_fee": {"type": "number", "description": "관리비"},
                    "partner_ids": {"type": "array", "items": {"type": "string"}, "description": "파트너 ID 목록"},
                    "manager_ids": {"type": "array", "items": {"type": "string"}, "description": "매니저 ID 목록"},
                    "description": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["title"],
            },
        ),
        Tool(
            name="create_episode",
            description=(
                "프로젝트에 새 에피소드를 생성합니다. "
                "project_id, episode_number, title은 필수입니다. "
                "work_steps는 JSONB로 작업 단계를 정의합니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "프로젝트 ID"},
                    "episode_number": {"type": "integer", "description": "에피소드 번호"},
                    "title": {"type": "string", "description": "에피소드 제목"},
                    "description": {"type": "string"},
                    "status": {"type": "string", "enum": ["waiting", "in_progress", "review", "completed"]},
                    "assignee": {"type": "string", "description": "담당 파트너 ID"},
                    "manager": {"type": "string", "description": "매니저 ID"},
                    "start_date": {"type": "string", "description": "시작일 (YYYY-MM-DD)"},
                    "due_date": {"type": "string", "description": "마감일 (YYYY-MM-DD)"},
                    "budget_total": {"type": "number"},
                    "budget_partner": {"type": "number"},
                    "budget_management": {"type": "number"},
                    "work_content": {"type": "array", "items": {"type": "string"}},
                    "work_steps": {
                        "type": "object",
                        "description": "작업 단계 JSONB. 예: {\"롱폼\": [{\"id\": \"1\", \"label\": \"1차 가편\", \"status\": \"completed\", \"startDate\": \"2026-03-01\", \"dueDate\": \"2026-03-05\"}]}",
                    },
                    "payment_status": {"type": "string", "enum": ["pending", "completed"]},
                    "payment_due_date": {"type": "string"},
                },
                "required": ["project_id", "episode_number", "title"],
            },
        ),
        Tool(
            name="update_episode",
            description=(
                "에피소드 정보를 업데이트합니다. "
                "상태, 예산, 마감일, work_steps 등 모든 필드를 수정할 수 있습니다. "
                "work_steps 수정 시 전체 JSONB를 넘겨야 합니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "episode_id": {"type": "string", "description": "에피소드 ID"},
                    "status": {"type": "string", "enum": ["waiting", "in_progress", "review", "completed"]},
                    "title": {"type": "string"},
                    "due_date": {"type": "string", "description": "마감일 (YYYY-MM-DD)"},
                    "start_date": {"type": "string"},
                    "budget_total": {"type": "number"},
                    "budget_partner": {"type": "number"},
                    "budget_management": {"type": "number"},
                    "work_steps": {
                        "type": "object",
                        "description": "작업 단계 JSONB 전체 교체",
                    },
                    "work_content": {"type": "array", "items": {"type": "string"}},
                    "payment_status": {"type": "string", "enum": ["pending", "completed"]},
                    "payment_due_date": {"type": "string"},
                    "invoice_status": {"type": "string", "enum": ["pending", "completed"]},
                    "invoice_date": {"type": "string"},
                    "assignee": {"type": "string"},
                    "manager": {"type": "string"},
                },
                "required": ["episode_id"],
            },
        ),
        Tool(
            name="update_project",
            description=(
                "프로젝트 정보를 업데이트합니다. "
                "제목, 예산, 상태, 파트너 등 모든 필드를 수정할 수 있습니다."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "프로젝트 ID"},
                    "title": {"type": "string"},
                    "status": {"type": "string", "enum": ["planning", "in_progress", "completed", "on_hold"]},
                    "total_amount": {"type": "number"},
                    "partner_payment": {"type": "number"},
                    "management_fee": {"type": "number"},
                    "client": {"type": "string"},
                    "client_id": {"type": "string"},
                    "partner_ids": {"type": "array", "items": {"type": "string"}},
                    "manager_ids": {"type": "array", "items": {"type": "string"}},
                    "description": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "category": {"type": "string"},
                },
                "required": ["project_id"],
            },
        ),
    ]


@server.call_tool()
async def handle_call_tool(name: str, arguments: dict) -> list[TextContent]:
    supabase = get_supabase()
    try:
        if name == "get_summary":
            result = await _get_summary(supabase)
        elif name == "list_projects":
            result = await _list_projects(supabase, arguments)
        elif name == "get_project":
            result = await _get_project(supabase, arguments)
        elif name == "list_episodes":
            result = await _list_episodes(supabase, arguments)
        elif name == "get_upcoming_deadlines":
            result = await _get_upcoming_deadlines(supabase, arguments)
        elif name == "list_partners":
            result = await _list_partners(supabase, arguments)
        elif name == "list_clients":
            result = await _list_clients(supabase, arguments)
        elif name == "update_project_status":
            result = await _update_project_status(supabase, arguments)
        elif name == "update_episode_status":
            result = await _update_episode_status(supabase, arguments)
        elif name == "list_portfolio":
            result = await _list_portfolio(supabase, arguments)
        elif name == "add_portfolio_item":
            result = await _add_portfolio_item(supabase, arguments)
        elif name == "toggle_portfolio_published":
            result = await _toggle_portfolio_published(supabase, arguments)
        elif name == "get_marketing_stats":
            result = await _get_marketing_stats(supabase)
        elif name == "create_project":
            result = await _create_project(supabase, arguments)
        elif name == "create_episode":
            result = await _create_episode(supabase, arguments)
        elif name == "update_episode":
            result = await _update_episode(supabase, arguments)
        elif name == "update_project":
            result = await _update_project(supabase, arguments)
        elif name == "delete_episode":
            result = await _delete_episode(supabase, arguments)
        elif name == "delete_project":
            result = await _delete_project(supabase, arguments)
        elif name == "create_partner":
            result = await _create_partner(supabase, arguments)
        elif name == "update_partner":
            result = await _update_partner(supabase, arguments)
        elif name == "create_client":
            result = await _create_client(supabase, arguments)
        elif name == "update_client":
            result = await _update_client(supabase, arguments)
        elif name == "update_work_step":
            result = await _update_work_step(supabase, arguments)
        elif name == "search_episodes":
            result = await _search_episodes(supabase, arguments)
        elif name == "get_partner_payment_summary":
            result = await _get_partner_payment_summary(supabase, arguments)
        elif name == "get_project_financials":
            result = await _get_project_financials(supabase, arguments)
        elif name == "batch_update_payments":
            result = await _batch_update_payments(supabase, arguments)
        elif name == "duplicate_episode":
            result = await _duplicate_episode(supabase, arguments)
        else:
            result = {"error": f"알 수 없는 도구: {name}"}
    except Exception as e:
        result = {"error": str(e)}

    return [TextContent(type="text", text=fmt(result))]


# ── 도구 구현 ────────────────────────────────────────────────────────────────

async def _get_summary(supabase: Client) -> dict:
    now = today_kst()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    projects = (supabase.table("projects")
                .select("id, title, status, total_amount, management_fee, completed_at")
                .execute().data or [])

    episodes = (supabase.table("episodes")
                .select("id, project_id, episode_number, title, status, due_date, assignee")
                .execute().data or [])

    today_str = now.strftime("%Y-%m-%d")
    cutoff_7 = (now + timedelta(days=7)).strftime("%Y-%m-%d")

    upcoming = sorted(
        [e for e in episodes
         if e.get("due_date") and today_str <= e["due_date"] <= cutoff_7
         and e["status"] != "completed"],
        key=lambda x: x["due_date"]
    )

    this_month_fee = sum(
        p.get("management_fee", 0) or 0
        for p in projects
        if p.get("completed_at") and p["completed_at"] >= month_start
    )

    return {
        "as_of": now.strftime("%Y-%m-%d %H:%M KST"),
        "projects": {
            "total": len(projects),
            "planning": sum(1 for p in projects if p["status"] == "planning"),
            "in_progress": sum(1 for p in projects if p["status"] == "in_progress"),
            "completed": sum(1 for p in projects if p["status"] == "completed"),
            "on_hold": sum(1 for p in projects if p["status"] == "on_hold"),
        },
        "episodes": {
            "total": len(episodes),
            "waiting": sum(1 for e in episodes if e["status"] == "waiting"),
            "in_progress": sum(1 for e in episodes if e["status"] == "in_progress"),
            "review": sum(1 for e in episodes if e["status"] == "review"),
            "completed": sum(1 for e in episodes if e["status"] == "completed"),
        },
        "this_month_management_fee": this_month_fee,
        "upcoming_deadlines_7days": len(upcoming),
        "upcoming_deadlines_preview": upcoming[:5],
    }


async def _list_projects(supabase: Client, args: dict) -> list:
    query = supabase.table("projects").select("*").order("created_at", desc=True)
    if status := args.get("status"):
        query = query.eq("status", status)
    return query.execute().data or []


async def _get_project(supabase: Client, args: dict) -> dict:
    project_id = args["project_id"]
    project = (supabase.table("projects")
               .select("*")
               .eq("id", project_id)
               .single()
               .execute().data)
    episodes = (supabase.table("episodes")
                .select("*")
                .eq("project_id", project_id)
                .order("episode_number")
                .execute().data or [])
    return {"project": project, "episodes": episodes}


async def _list_episodes(supabase: Client, args: dict) -> list:
    query = supabase.table("episodes").select("*").order("due_date", desc=False)
    if status := args.get("status"):
        query = query.eq("status", status)
    if assignee := args.get("assignee_id"):
        query = query.eq("assignee", assignee)
    if project_id := args.get("project_id"):
        query = query.eq("project_id", project_id)
    return query.execute().data or []


async def _get_upcoming_deadlines(supabase: Client, args: dict) -> list:
    days = int(args.get("days", 7))
    now = today_kst()
    today_str = now.strftime("%Y-%m-%d")
    cutoff = (now + timedelta(days=days)).strftime("%Y-%m-%d")

    return (supabase.table("episodes")
            .select("id, project_id, episode_number, title, status, due_date, assignee")
            .gte("due_date", today_str)
            .lte("due_date", cutoff)
            .neq("status", "completed")
            .order("due_date")
            .execute().data or [])


async def _list_partners(supabase: Client, args: dict) -> list:
    # 보안: partners_safe 뷰로 조회 — service_role 는 is_admin()=false 라
    # email/phone/bank/bank_account 가 NULL 마스킹됨(슬랙/Vbot 으로 PII 유출 방지).
    query = supabase.table("partners_safe").select("*").order("created_at", desc=True)
    if status := args.get("status"):
        query = query.eq("status", status)
    return query.execute().data or []


async def _list_clients(supabase: Client, args: dict) -> list:
    query = supabase.table("clients").select("*").order("created_at", desc=True)
    if status := args.get("status"):
        query = query.eq("status", status)
    return query.execute().data or []


async def _update_project_status(supabase: Client, args: dict) -> dict:
    project_id = args["project_id"]
    status = args["status"]
    updates: dict = {"status": status, "updated_at": datetime.utcnow().isoformat()}
    if status == "completed":
        updates["completed_at"] = datetime.utcnow().isoformat()
    result = (supabase.table("projects")
              .update(updates)
              .eq("id", project_id)
              .execute())
    return {"success": True, "project_id": project_id, "new_status": status}


async def _update_episode_status(supabase: Client, args: dict) -> dict:
    episode_id = args["episode_id"]
    status = args["status"]
    updates = {"status": status, "updated_at": datetime.utcnow().isoformat()}
    result = (supabase.table("episodes")
              .update(updates)
              .eq("id", episode_id)
              .execute())
    return {"success": True, "episode_id": episode_id, "new_status": status}


async def _list_portfolio(supabase: Client, args: dict) -> list:
    query = supabase.table("portfolio_items").select("*").order("created_at", desc=True)
    if args.get("published_only"):
        query = query.eq("is_published", True)
    return query.execute().data or []


async def _add_portfolio_item(supabase: Client, args: dict) -> dict:
    row = {
        "title": args["title"],
        "client": args["client"],
        "youtube_url": args["youtube_url"],
        "description": args.get("description"),
        "completed_at": args.get("completed_at"),
        "tags": args.get("tags", []),
        "is_published": args.get("is_published", False),
    }
    result = (supabase.table("portfolio_items")
              .insert(row)
              .select()
              .single()
              .execute())
    return {"success": True, "item": result.data}


async def _toggle_portfolio_published(supabase: Client, args: dict) -> dict:
    item_id = args["id"]
    is_published = args["is_published"]
    (supabase.table("portfolio_items")
     .update({"is_published": is_published, "updated_at": datetime.utcnow().isoformat()})
     .eq("id", item_id)
     .execute())
    return {"success": True, "id": item_id, "is_published": is_published}


async def _get_marketing_stats(supabase: Client) -> dict:
    portfolio = (supabase.table("portfolio_items")
                 .select("id, title, client, is_published")
                 .execute().data or [])

    projects = (supabase.table("projects")
                .select("id, client, status")
                .execute().data or [])

    clients = (supabase.table("clients")
               .select("id, name, status")
               .execute().data or [])

    # 클라이언트별 프로젝트 집계
    client_stats = {}
    for p in projects:
        client_name = p.get("client") or "미지정"
        if client_name not in client_stats:
            client_stats[client_name] = {"total": 0, "completed": 0}
        client_stats[client_name]["total"] += 1
        if p["status"] == "completed":
            client_stats[client_name]["completed"] += 1

    return {
        "portfolio": {
            "total": len(portfolio),
            "published": sum(1 for p in portfolio if p["is_published"]),
            "unpublished": sum(1 for p in portfolio if not p["is_published"]),
        },
        "clients": {
            "total": len(clients),
            "active": sum(1 for c in clients if c["status"] == "active"),
        },
        "projects_by_client": client_stats,
    }


async def _create_project(supabase: Client, args: dict) -> dict:
    row = {"title": args["title"]}
    for key in ("client", "client_id", "status", "category", "description",
                "total_amount", "partner_payment", "management_fee"):
        if key in args:
            row[key] = args[key]
    for key in ("channels", "work_content", "partner_ids", "manager_ids", "tags"):
        if key in args:
            row[key] = args[key]
    result = supabase.table("projects").insert(row).execute()
    return {"success": True, "project": result.data[0] if result.data else row}


async def _create_episode(supabase: Client, args: dict) -> dict:
    row = {
        "project_id": args["project_id"],
        "episode_number": args["episode_number"],
        "title": args["title"],
    }
    for key in ("description", "status", "assignee", "manager",
                "start_date", "due_date", "budget_total", "budget_partner",
                "budget_management", "payment_status", "payment_due_date"):
        if key in args:
            row[key] = args[key]
    for key in ("work_content", "work_steps"):
        if key in args:
            row[key] = args[key]
    result = supabase.table("episodes").insert(row).execute()
    return {"success": True, "episode": result.data[0] if result.data else row}


async def _update_episode(supabase: Client, args: dict) -> dict:
    import sys
    episode_id = args["episode_id"]
    updates = {"updated_at": datetime.utcnow().isoformat()}
    for key in ("status", "title", "due_date", "start_date",
                "budget_total", "budget_partner", "budget_management",
                "payment_status", "payment_due_date", "invoice_status",
                "invoice_date", "assignee", "manager"):
        if key in args:
            updates[key] = args[key]
    for key in ("work_steps", "work_content"):
        if key in args:
            updates[key] = args[key]
    # 디버그 로깅
    print(f"[_update_episode] id={episode_id}, fields={list(updates.keys())}", file=sys.stderr, flush=True)
    if "work_steps" in updates:
        ws = updates["work_steps"]
        for wtype, steps in (ws.items() if isinstance(ws, dict) else []):
            for s in steps:
                print(f"  [work_steps] {wtype}: {s.get('label')} ({s.get('status')})", file=sys.stderr, flush=True)
    result = (supabase.table("episodes")
              .update(updates)
              .eq("id", episode_id)
              .execute())
    updated_count = len(result.data) if result.data else 0
    print(f"[_update_episode] result rows={updated_count}", file=sys.stderr, flush=True)
    # 검증: 재조회
    verify = (supabase.table("episodes")
              .select("work_steps, updated_at")
              .eq("id", episode_id)
              .execute())
    if verify.data and "work_steps" in updates:
        actual_ws = verify.data[0].get("work_steps", {})
        actual_labels = [s.get("label") for s in actual_ws.get("롱폼", [])]
        expected_labels = [s.get("label") for s in updates["work_steps"].get("롱폼", [])]
        match = actual_labels == expected_labels
        print(f"[_update_episode] verify: expected={expected_labels} actual={actual_labels} match={match}", file=sys.stderr, flush=True)
        if not match:
            return {"success": False, "episode_id": episode_id,
                    "error": "DB 반영 실패", "expected": expected_labels, "actual": actual_labels}
    return {"success": True, "episode_id": episode_id, "updated_fields": list(updates.keys()),
            "rows_affected": updated_count}


async def _update_project(supabase: Client, args: dict) -> dict:
    project_id = args["project_id"]
    updates = {"updated_at": datetime.utcnow().isoformat()}
    for key in ("title", "status", "total_amount", "partner_payment",
                "management_fee", "client", "client_id", "description", "category"):
        if key in args:
            updates[key] = args[key]
    for key in ("partner_ids", "manager_ids", "tags"):
        if key in args:
            updates[key] = args[key]
    if updates.get("status") == "completed":
        updates["completed_at"] = datetime.utcnow().isoformat()
    (supabase.table("projects")
     .update(updates)
     .eq("id", project_id)
     .execute())
    return {"success": True, "project_id": project_id, "updated_fields": list(updates.keys())}


async def _delete_episode(supabase: Client, args: dict) -> dict:
    episode_id = args["episode_id"]
    supabase.table("episodes").delete().eq("id", episode_id).execute()
    return {"success": True, "deleted_episode_id": episode_id}


async def _delete_project(supabase: Client, args: dict) -> dict:
    project_id = args["project_id"]
    # 하위 에피소드 먼저 삭제
    episodes = (supabase.table("episodes")
                .select("id")
                .eq("project_id", project_id)
                .execute().data or [])
    for ep in episodes:
        supabase.table("episodes").delete().eq("id", ep["id"]).execute()
    supabase.table("projects").delete().eq("id", project_id).execute()
    return {"success": True, "deleted_project_id": project_id,
            "deleted_episodes": len(episodes)}


async def _create_partner(supabase: Client, args: dict) -> dict:
    row = {}
    for key in ("name", "email", "phone", "company", "partner_type", "role",
                "status", "bank", "bank_account", "position", "job_title"):
        if key in args:
            row[key] = args[key]
    result = supabase.table("partners").insert(row).execute()
    return {"success": True, "partner": result.data[0] if result.data else row}


async def _update_partner(supabase: Client, args: dict) -> dict:
    partner_id = args["partner_id"]
    updates = {}
    for key in ("name", "email", "phone", "company", "partner_type", "role",
                "status", "bank", "bank_account", "position", "job_title"):
        if key in args:
            updates[key] = args[key]
    supabase.table("partners").update(updates).eq("id", partner_id).execute()
    return {"success": True, "partner_id": partner_id, "updated_fields": list(updates.keys())}


async def _create_client(supabase: Client, args: dict) -> dict:
    row = {}
    for key in ("name", "contact_person", "email", "phone", "company",
                "address", "status", "notes"):
        if key in args:
            row[key] = args[key]
    result = supabase.table("clients").insert(row).execute()
    return {"success": True, "client": result.data[0] if result.data else row}


async def _update_client(supabase: Client, args: dict) -> dict:
    client_id = args["client_id"]
    updates = {"updated_at": datetime.utcnow().isoformat()}
    for key in ("name", "contact_person", "email", "phone", "company",
                "address", "status", "notes"):
        if key in args:
            updates[key] = args[key]
    supabase.table("clients").update(updates).eq("id", client_id).execute()
    return {"success": True, "client_id": client_id, "updated_fields": list(updates.keys())}


async def _update_work_step(supabase: Client, args: dict) -> dict:
    episode_id = args["episode_id"]
    work_type = args["work_type"]
    step_id = args["step_id"]

    # 현재 work_steps 가져오기
    ep = (supabase.table("episodes")
          .select("work_steps")
          .eq("id", episode_id)
          .execute().data)
    if not ep:
        return {"error": f"에피소드를 찾을 수 없음: {episode_id}"}

    work_steps = ep[0].get("work_steps") or {}
    steps = work_steps.get(work_type, [])

    found = False
    for step in steps:
        if step.get("id") == step_id:
            for field in ("label", "category", "status", "startDate", "dueDate", "assigneeId"):
                if field in args:
                    step[field] = args[field]
            found = True
            break

    if not found:
        return {"error": f"스텝을 찾을 수 없음: work_type={work_type}, step_id={step_id}"}

    work_steps[work_type] = steps
    supabase.table("episodes").update({
        "work_steps": work_steps,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", episode_id).execute()

    return {"success": True, "episode_id": episode_id,
            "work_type": work_type, "step_id": step_id, "updated_step": step}


async def _search_episodes(supabase: Client, args: dict) -> list:
    query_str = args["query"]
    q = supabase.table("episodes").select("*").ilike("title", f"%{query_str}%")
    if project_id := args.get("project_id"):
        q = q.eq("project_id", project_id)
    return q.order("episode_number").execute().data or []


async def _get_partner_payment_summary(supabase: Client, args: dict) -> dict:
    partners = supabase.table("partners").select("id, name").execute().data or []
    partner_map = {p["id"]: p["name"] for p in partners}

    q = supabase.table("episodes").select(
        "id, title, assignee, budget_partner, payment_status, project_id"
    )
    if partner_id := args.get("partner_id"):
        q = q.eq("assignee", partner_id)
    episodes = q.execute().data or []

    summary = {}
    for ep in episodes:
        pid = ep.get("assignee") or "미지정"
        pname = partner_map.get(pid, pid)
        if pname not in summary:
            summary[pname] = {"partner_id": pid, "total": 0, "pending": 0,
                              "completed": 0, "pending_amount": 0, "completed_amount": 0}
        s = summary[pname]
        amt = ep.get("budget_partner") or 0
        s["total"] += 1
        if ep.get("payment_status") == "completed":
            s["completed"] += 1
            s["completed_amount"] += amt
        else:
            s["pending"] += 1
            s["pending_amount"] += amt

    return summary


async def _get_project_financials(supabase: Client, args: dict) -> dict:
    q = supabase.table("projects").select("*")
    if project_id := args.get("project_id"):
        q = q.eq("id", project_id)
    projects = q.execute().data or []

    results = []
    for p in projects:
        total = p.get("total_amount") or 0
        partner = p.get("partner_payment") or 0
        mgmt = p.get("management_fee") or 0
        margin = round(mgmt / total * 100, 1) if total > 0 else 0
        results.append({
            "project_id": p["id"],
            "title": p["title"],
            "status": p["status"],
            "total_amount": total,
            "partner_payment": partner,
            "management_fee": mgmt,
            "margin_rate": margin,
        })
    return {"projects": results,
            "totals": {
                "total_amount": sum(r["total_amount"] for r in results),
                "partner_payment": sum(r["partner_payment"] for r in results),
                "management_fee": sum(r["management_fee"] for r in results),
            }}


async def _batch_update_payments(supabase: Client, args: dict) -> dict:
    episode_ids = args["episode_ids"]
    updates = {"updated_at": datetime.utcnow().isoformat()}
    if "payment_status" in args:
        updates["payment_status"] = args["payment_status"]
    if "invoice_status" in args:
        updates["invoice_status"] = args["invoice_status"]
    if "invoice_date" in args:
        updates["invoice_date"] = args["invoice_date"]

    updated = []
    for eid in episode_ids:
        supabase.table("episodes").update(updates).eq("id", eid).execute()
        updated.append(eid)
    return {"success": True, "updated_count": len(updated), "episode_ids": updated}


async def _duplicate_episode(supabase: Client, args: dict) -> dict:
    source_id = args["source_episode_id"]
    new_number = args["new_episode_number"]

    source = (supabase.table("episodes")
              .select("*")
              .eq("id", source_id)
              .execute().data)
    if not source:
        return {"error": f"원본 에피소드를 찾을 수 없음: {source_id}"}

    src = source[0]
    # work_steps 복제 시 상태 초기화
    work_steps = src.get("work_steps") or {}
    for wtype, steps in work_steps.items():
        for step in steps:
            step["status"] = "waiting"

    row = {
        "project_id": src["project_id"],
        "episode_number": new_number,
        "title": args.get("new_title", src["title"] + " (복제)"),
        "work_content": src.get("work_content"),
        "work_steps": work_steps,
        "assignee": src.get("assignee"),
        "manager": src.get("manager"),
        "budget_total": src.get("budget_total"),
        "budget_partner": src.get("budget_partner"),
        "budget_management": src.get("budget_management"),
        "status": "waiting",
    }
    result = supabase.table("episodes").insert(row).execute()
    return {"success": True, "episode": result.data[0] if result.data else row}


# ── 엔트리포인트 ─────────────────────────────────────────────────────────────

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
