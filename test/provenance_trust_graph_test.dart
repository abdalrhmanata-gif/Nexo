import 'package:test/test.dart';
import 'package:nexo_followthrough/application/provenance_chain.dart';
import 'package:nexo_followthrough/application/trust_graph.dart';
import 'package:nexo_followthrough/domain/provenance_event.dart';
import 'package:nexo_followthrough/domain/trust_graph.dart';

void main() {
  group('provenance chain', () {
    test('forms a verifiable append-only chain', () {
      final chain = ProvenanceChain();
      chain.append(
        missionId: 'm1',
        organizationId: 'org1',
        type: ProvenanceEventType.intentAccepted,
        actorType: 'user',
        actorId: 'u1',
        payload: {'objective': 'research'},
        correlationId: 'c1',
      );
      chain.append(
        missionId: 'm1',
        organizationId: 'org1',
        type: ProvenanceEventType.authorizationDecided,
        actorType: 'nexo',
        actorId: 'auth1',
        payload: {'decision': 'allow'},
        correlationId: 'c2',
        causationId: 'c1',
      );

      expect(chain.events, hasLength(2));
      expect(chain.events[1].previousEventHash, chain.events[0].eventHash);
      expect(chain.verifyIntegrity(), isTrue);
      expect(chain.findByCorrelation('c2')?.eventId, 'pe-2');
    });
  });

  group('trust graph', () {
    test('rejects cross-tenant edges', () {
      final graph = TrustGraph();
      graph.addNode(const TrustNode(
        id: 'e1',
        type: TrustNodeType.execution,
        organizationId: 'org-a',
        fingerprint: 'f1',
      ));
      graph.addNode(const TrustNode(
        id: 'o1',
        type: TrustNodeType.outcome,
        organizationId: 'org-b',
        fingerprint: 'f2',
      ));

      expect(
        () => graph.addEdge(const TrustEdge(
          id: 'x1',
          fromId: 'e1',
          toId: 'o1',
          type: TrustEdgeType.resultsIn,
          organizationId: 'org-a',
        )),
        throwsA(isA<TrustGraphViolation>()),
      );
    });

    test('outcome is explainable only with causal and verification edges', () {
      final graph = TrustGraph();
      graph.addNode(const TrustNode(
        id: 'v1',
        type: TrustNodeType.verification,
        organizationId: 'org-a',
        fingerprint: 'fv',
      ));
      graph.addNode(const TrustNode(
        id: 'e1',
        type: TrustNodeType.execution,
        organizationId: 'org-a',
        fingerprint: 'fe',
      ));
      graph.addNode(const TrustNode(
        id: 'o1',
        type: TrustNodeType.outcome,
        organizationId: 'org-a',
        fingerprint: 'fo',
      ));

      graph.addEdge(const TrustEdge(
        id: 'r1',
        fromId: 'e1',
        toId: 'o1',
        type: TrustEdgeType.resultsIn,
        organizationId: 'org-a',
      ));
      expect(graph.canExplainOutcome('o1'), isFalse);

      graph.addEdge(const TrustEdge(
        id: 'v-edge',
        fromId: 'v1',
        toId: 'o1',
        type: TrustEdgeType.verifies,
        organizationId: 'org-a',
      ));
      expect(graph.canExplainOutcome('o1'), isTrue);
    });
  });
}
