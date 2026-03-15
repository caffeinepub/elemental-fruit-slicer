import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Order "mo:core/Order";
import Map "mo:core/Map";
import Text "mo:core/Text";

actor {
  type ScoreRecord = {
    playerName : Text;
    score : Nat;
  };

  module ScoreRecord {
    public func compareByScore(a : ScoreRecord, b : ScoreRecord) : Order.Order {
      Nat.compare(b.score, a.score);
    };
  };

  let scores = Map.empty<Text, Nat>();

  public shared ({ caller }) func submitScore(playerName : Text, score : Nat) : async () {
    switch (scores.get(playerName)) {
      case (?existingScore) {
        if (score <= existingScore) {
          Runtime.trap("New score must be higher than existing score");
        };
      };
      case (null) {};
    };
    scores.add(playerName, score);
  };

  public query ({ caller }) func getTopScores() : async [ScoreRecord] {
    let records = scores.entries().toArray().map(
      func((playerName, score)) {
        {
          playerName;
          score;
        };
      }
    );
    let sortedRecords = records.sort(ScoreRecord.compareByScore);
    sortedRecords.sliceToArray(0, Nat.min(10, sortedRecords.size()));
  };
};
