"""
DBForge load/stress test.

Env vars:
  DBFORGE_TENANTS   number of seeded tenants (default 100)
  LOAD_SHAPE        "step" for stress step-load, else uses -u/-r CLI args
  DBFORGE_TOKEN_*   tokens are obtained via /auth/login using seeded users
Run:  locust -f tests/stress/locustfile.py --host http://localhost:8000
"""
import os, random, uuid
from locust import HttpUser, task, between, LoadTestShape, events

TENANTS = int(os.getenv("DBFORGE_TENANTS", "100"))

QUESTIONS = [
    "Show tomorrow's appointments for Dr. Rao",
    "How many patients registered this month?",
    "List students with grade above 80 in Databases",
    "Which doctors have no appointments today?",
    "Total fees collected per department",
]
FD_SAMPLE = {
    "attrs": ["A", "B", "C", "D", "E"],
    "fds": [{"lhs": ["A"], "rhs": ["B"]}, {"lhs": ["B", "C"], "rhs": ["E"]},
            {"lhs": ["E", "D"], "rhs": ["A"]}],
}


def zipf_tenant(n=TENANTS, s=1.2):
    """Pick a tenant index with Zipf-like skew so a few tenants are hot."""
    weights = [1 / (i ** s) for i in range(1, n + 1)]
    return random.choices(range(n), weights=weights, k=1)[0]


class DBForgeUser(HttpUser):
    wait_time = between(1, 5)

    def on_start(self):
        self.tenant_idx = zipf_tenant()
        email = f"user{self.tenant_idx}_{random.randint(1, 20)}@load.test"
        r = self.client.post("/api/v1/auth/login",
                             json={"email": email, "password": "loadtest"},
                             name="auth/login")
        token = r.json().get("data", {}).get("access_token") if r.ok else None
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}
        pr = self.client.get("/api/v1/projects", headers=self.headers, name="projects/list")
        projects = pr.json().get("data", []) if pr.ok else []
        self.project_id = projects[0]["project_id"] if projects else None

    def _ok_or_shed(self, resp):
        """429 is intentional load shedding, not a failure."""
        if resp.status_code == 429:
            resp.success()
        elif resp.status_code >= 500:
            resp.failure(f"server error {resp.status_code}")

    @task(20)
    def browse(self):
        if not self.project_id:
            return
        with self.client.get(f"/api/v1/projects/{self.project_id}",
                             headers=self.headers, name="projects/get",
                             catch_response=True) as r:
            self._ok_or_shed(r)

    @task(15)
    def deterministic_tools(self):
        endpoint = random.choice(["closure", "candidate-keys", "normal-form"])
        with self.client.post(f"/api/v1/tools/{endpoint}", json=FD_SAMPLE,
                              headers=self.headers, name=f"tools/{endpoint}",
                              catch_response=True) as r:
            self._ok_or_shed(r)

    @task(20)
    def nl_query_new(self):
        if not self.project_id:
            return
        q = f"{random.choice(QUESTIONS)} #{random.randint(1, 10_000)}"  # cache miss
        with self.client.post(f"/api/v1/projects/{self.project_id}/query",
                              json={"question": q}, headers=self.headers,
                              name="query/new", catch_response=True) as r:
            self._ok_or_shed(r)

    @task(20)
    def nl_query_repeat(self):
        if not self.project_id:
            return
        with self.client.post(f"/api/v1/projects/{self.project_id}/query",
                              json={"question": QUESTIONS[0]}, headers=self.headers,
                              name="query/cached", catch_response=True) as r:
            self._ok_or_shed(r)

    @task(15)
    def write_txn(self):
        if not self.project_id:
            return
        hdr = {**self.headers, "Idempotency-Key": str(uuid.uuid4())}
        with self.client.post(f"/api/v1/projects/{self.project_id}/execute",
                              json={"plan": "book_appointment",
                                    "params": {"doctor_id": random.randint(1, 50),
                                               "patient_id": random.randint(1, 10_000)}},
                              headers=hdr, name="write/execute",
                              catch_response=True) as r:
            self._ok_or_shed(r)

    @task(5)
    def approvals(self):
        with self.client.get("/api/v1/approvals?status=pending",
                             headers=self.headers, name="approvals/list",
                             catch_response=True) as r:
            self._ok_or_shed(r)


class HotRowWriter(HttpUser):
    """Concurrency-correctness workload: many writers on the same row.
    Run with: locust -f ... HotRowWriter   then verify final balance via SQL."""
    wait_time = between(0, 0.1)
    weight = 0  # only runs when selected explicitly

    @task
    def increment(self):
        self.client.post("/api/v1/projects/hot/execute",
                         json={"plan": "increment_balance", "params": {"account_id": 1}},
                         headers={"Idempotency-Key": str(uuid.uuid4())},
                         name="write/hot-row")


if os.getenv("LOAD_SHAPE") == "step":
    class StepShape(LoadTestShape):
        """Stress shape: +100 users every 2 minutes up to 2,000.
        Defined only when LOAD_SHAPE=step, so normal runs use -u/-r."""
        step_users, step_time, max_users = 100, 120, 2000

        def tick(self):
            users = (int(self.get_run_time() // self.step_time) + 1) * self.step_users
            if users > self.max_users:
                return None
            return users, self.step_users


@events.quitting.add_listener
def enforce_thresholds(environment, **_):
    """Fail the CI run if thresholds are breached."""
    s = environment.stats.total
    if s.fail_ratio > 0.01:
        environment.process_exit_code = 1
    elif s.get_response_time_percentile(0.95) > 6000:
        environment.process_exit_code = 1
