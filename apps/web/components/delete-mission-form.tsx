"use client";

export function DeleteMissionForm({ missionId }: { missionId: string }) {
  return (
    <form action={`/api/missions/${missionId}`} method="post" onSubmit={(event) => {
      if (!window.confirm("Delete this Mission?")) event.preventDefault();
    }}>
      <input type="hidden" name="_method" value="DELETE" />
      <button className="button button-danger" type="submit">Delete Mission</button>
    </form>
  );
}
